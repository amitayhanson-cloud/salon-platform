/**
 * POST /api/webhooks/twilio/whatsapp
 * Inbound WhatsApp webhook. Validate Twilio signature (SDK with parsed params from raw body),
 * log to whatsapp_inbound, handle YES/NO confirmation. Replies via TwiML.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import twilio from "twilio";
import {
  getWebhookUrl,
  logInboundWhatsApp,
  logAmbiguousWhatsApp,
  sendWhatsApp,
  normalizeE164,
  isYes,
  isNo,
  findAwaitingConfirmationByPhone,
  findNextBookingByPhoneWithStatus,
  markBookingConfirmed,
  markBookingCancelledByWhatsApp,
} from "@/lib/whatsapp";
import { createInboundDoc, updateInboundDoc } from "@/lib/whatsapp/inboundLog";
import { formatIsraelTime } from "@/lib/datetime/formatIsraelTime";

const WEBHOOK_PATH = "/api/webhooks/twilio/whatsapp";

function twimlMessage(to: string, body: string): string {
  const escaped = String(body)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${to}">${escaped}</Message></Response>`;
}

function xmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  const inboundId = randomUUID();
  console.log("[WA_WEBHOOK] start", { inboundId, ts: new Date().toISOString() });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[WA_WEBHOOK] missing TWILIO_AUTH_TOKEN");
    return xmlResponse(
      twimlMessage("", "Something went wrong. Please contact the salon."),
      200
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[WA_WEBHOOK] failed to read body", { inboundId, error: e });
    return xmlResponse(
      twimlMessage("", "Something went wrong. Please contact the salon."),
      200
    );
  }

  const params = new URLSearchParams(rawBody);
  const twilioParams: Record<string, string | string[]> = {};
  for (const key of Array.from(new Set(params.keys()))) {
    const vals = params.getAll(key);
    twilioParams[key] = vals.length === 1 ? vals[0] : vals;
  }

  const urlForSig =
    process.env.TWILIO_WEBHOOK_URL?.trim()?.replace(/\/$/, "") ??
    getWebhookUrl(WEBHOOK_PATH, request).url;
  const twilioSignature = request.headers.get("x-twilio-signature") ?? "";
  const skipSignature =
    process.env.NODE_ENV !== "production" && process.env.SKIP_TWILIO_SIGNATURE === "true";
  const signatureMode = process.env.TWILIO_SIGNATURE_MODE?.trim()?.toLowerCase() === "log_only"
    ? "log_only"
    : "enforce";

  const signatureValid =
    skipSignature || twilio.validateRequest(authToken, twilioSignature, urlForSig, twilioParams);

  if (!signatureValid) {
    const requestHost = request.headers.get("host") ?? "";
    const xForwardedHost = request.headers.get("x-forwarded-host") ?? null;
    const xForwardedProto = request.headers.get("x-forwarded-proto") ?? null;
    const requestUrl = request.url;
    if (signatureMode === "log_only") {
      console.log("[WA_WEBHOOK] signature_debug", {
        urlForSig,
        requestUrl,
        host: requestHost,
        xForwardedHost,
        xForwardedProto,
        twilioSignaturePresent: !!twilioSignature,
      });
    } else {
      console.error("[WA_WEBHOOK] signature_failed", {
        inboundId,
        urlForSig,
        signatureHeaderLength: twilioSignature.length,
        rawBodyLength: rawBody.length,
        paramKeys: Object.keys(twilioParams).sort(),
      });
      const From = String(twilioParams["From"] ?? "").trim();
      const To = String(twilioParams["To"] ?? "").trim();
      const Body = String(twilioParams["Body"] ?? "").trim();
      const MessageSid = String(twilioParams["MessageSid"] ?? "").trim();
      try {
        await createInboundDoc({
          inboundId,
          from: From,
          to: To,
          body: Body,
          messageSid: MessageSid,
          status: "signature_failed",
          errorMessage: "Invalid signature",
        });
      } catch (e) {
        console.error("[WA_WEBHOOK] failed to write inbound doc", e);
      }
      return new NextResponse(twimlMessage(From, "Invalid request."), {
        status: 403,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }
  }

  const From = String(twilioParams["From"] ?? "").trim();
  const To = String(twilioParams["To"] ?? "").trim();
  const Body = String(twilioParams["Body"] ?? "").trim();
  const MessageSid = String(twilioParams["MessageSid"] ?? "").trim();
  const NumMedia = String(twilioParams["NumMedia"] ?? "").trim();
  console.log("[WA_WEBHOOK] inbound", { inboundId, From, To, Body, MessageSid, NumMedia });

  try {
    await createInboundDoc({
      inboundId,
      from: From,
      to: To,
      body: Body,
      messageSid: MessageSid,
      status: "received",
    });
  } catch (e) {
    console.error("[WA_WEBHOOK] failed to write inbound received", e);
  }

  try {
    return await handleInbound();
  } catch (err) {
    console.error("[WA_WEBHOOK] unexpected error", { inboundId, error: err });
    try {
      await updateInboundDoc(inboundId, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // ignore
    }
    const friendly = "Something went wrong. Please contact the salon.";
    return xmlResponse(twimlMessage(From || "", friendly));
  }

  async function handleInbound(): Promise<NextResponse> {
    if (!From || !MessageSid) {
      try {
        await updateInboundDoc(inboundId, { status: "error", errorMessage: "Missing From or MessageSid" });
      } catch {
        // ignore
      }
      return xmlResponse(twimlMessage(From || "", "Something went wrong. Please contact the salon."));
    }

    const fromE164 = normalizeE164(From.replace(/^whatsapp:/, ""), "IL");

    await logInboundWhatsApp({
      fromPhone: From,
      toPhone: To,
      body: Body,
      twilioMessageSid: MessageSid,
    });

    const isYesReply = isYes(Body);
    const isNoReply = isNo(Body);

    const sendReply = async (replyBody: string) => {
      try {
        await sendWhatsApp({ toE164: fromE164, body: replyBody });
      } catch (e) {
        console.error("[WA_WEBHOOK] sendWhatsApp failed", { inboundId, error: e });
      }
    };

    if (isYesReply || isNoReply) {
      const { bookings, count } = await findAwaitingConfirmationByPhone(fromE164);
      console.log("[WA_WEBHOOK]", {
        fromE164,
        foundCount: count,
        bookingRef: count === 1 ? `sites/${bookings[0].siteId}/bookings/${bookings[0].id}` : null,
      });

      if (count === 0) {
        try {
          await updateInboundDoc(inboundId, { status: "no_booking" });
        } catch {
          // ignore
        }
        if (isYesReply) {
          const alreadyConfirmed = await findNextBookingByPhoneWithStatus(fromE164, "confirmed");
          if (alreadyConfirmed) {
            const reply = "התור כבר מאושר 😊";
            await sendReply(reply);
            return xmlResponse(twimlMessage(From, reply));
          }
        }
        if (isNoReply) {
          const alreadyCancelled = await findNextBookingByPhoneWithStatus(fromE164, "cancelled");
          if (alreadyCancelled) {
            const reply = "התור כבר בוטל.";
            await sendReply(reply);
            return xmlResponse(twimlMessage(From, reply));
          }
        }
        const reply =
          "לא מצאתי תור שממתין לאישור עבור המספר הזה. אם קבעת תור, אפשר לפנות למספרה.";
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }

      if (count > 1) {
        const bookingRefs = bookings.map((b) => `sites/${b.siteId}/bookings/${b.id}`);
        await logAmbiguousWhatsApp({
          fromPhone: From,
          toPhone: To,
          body: Body,
          twilioMessageSid: MessageSid,
          bookingRefs,
        });
        try {
          await updateInboundDoc(inboundId, {
            status: "ambiguous",
            errorMessage: `Multiple bookings: ${bookingRefs.join(", ")}`,
          });
        } catch {
          // ignore
        }
        const reply =
          "יש לך יותר מתור אחד שממתין לאישור. אנא פנה למספרה עם שעת התור שברצונך לאשר או לבטל.";
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }

      const booking = bookings[0];
      const bookingRef = `sites/${booking.siteId}/bookings/${booking.id}`;

      if (isYesReply) {
        await markBookingConfirmed(booking.siteId, booking.id);
        console.log("[WA_WEBHOOK] updated booking", { inboundId, bookingRef, newStatus: "confirmed" });
        try {
          await updateInboundDoc(inboundId, { status: "matched_yes", bookingRef });
        } catch {
          // ignore
        }
        const timeStr = formatIsraelTime(booking.startAt);
        const reply = `אושר ✅ נתראה ב-${timeStr} ב-${booking.salonName}.`;
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }

      if (isNoReply) {
        await markBookingCancelledByWhatsApp(booking.siteId, booking.id);
        console.log("[WA_WEBHOOK] updated booking", { inboundId, bookingRef, newStatus: "cancelled" });
        try {
          await updateInboundDoc(inboundId, { status: "matched_no", bookingRef });
        } catch {
          // ignore
        }
        const reply = "הבנתי, ביטלתי את התור.";
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }
    }

    try {
      await updateInboundDoc(inboundId, { status: "no_match" });
    } catch {
      // ignore
    }
    const help = 'כדי לאשר תור השב/השיבי "כן", כדי לבטל השב/השיבי "לא".';
    await sendReply(help);
    return xmlResponse(twimlMessage(From, help));
  }
}
