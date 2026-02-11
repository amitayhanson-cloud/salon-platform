/**
 * POST /api/webhooks/twilio/whatsapp
 * Inbound WhatsApp webhook. Validate Twilio signature (SDK with parsed params from raw body),
 * log to whatsapp_inbound. Handles YES/NO and selection menu (multiple bookings).
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
  normalizeInbound,
  findBookingsAwaitingConfirmationByPhoneMulti,
  findNextBookingByPhoneWithStatus,
  markBookingConfirmed,
  markBookingCancelledByWhatsApp,
  getBookingByRefIfAwaitingConfirmation,
  createWhatsAppSession,
  getWhatsAppSession,
  deleteWhatsAppSession,
} from "@/lib/whatsapp";
import { createInboundDoc, updateInboundDoc } from "@/lib/whatsapp/inboundLog";
import { formatIsraelTime, formatIsraelDateTime } from "@/lib/datetime/formatIsraelTime";

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
    return xmlResponse(twimlMessage("", "משהו השתבש. אנא פנה/י למספרה."), 200);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[WA_WEBHOOK] failed to read body", { inboundId, error: e });
    return xmlResponse(twimlMessage("", "משהו השתבש. אנא פנה/י למספרה."), 200);
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
    const errObj = err as { code?: number; message?: string; name?: string; stack?: string };
    const errCode = errObj?.code;
    const errMessage = errObj?.message ?? String(err);
    const isIndexError = errCode === 9 && /index/i.test(errMessage);

    console.error("[WA_WEBHOOK] error", {
      inboundId,
      messageSid: MessageSid,
      from: From,
      body: Body,
      errName: errObj?.name,
      errCode: errCode ?? null,
      errMessage,
      errStack: errObj?.stack ?? null,
    });
    if (isIndexError) {
      console.error("[WA_WEBHOOK] missing_index", { inboundId, errMessage });
    }
    try {
      await updateInboundDoc(inboundId, {
        status: isIndexError ? "missing_index" : "error",
        errorCode: errCode ?? null,
        errorMessage: errMessage,
        errorStack: errObj?.stack ?? null,
      });
    } catch {
      // ignore
    }
    if (isIndexError) {
      return xmlResponse(
        twimlMessage(From || "", "System needs a database index. Please contact the salon.")
      );
    }
    return xmlResponse(
      twimlMessage(From || "", "משהו השתבש. אנא פנה/י למספרה.")
    );
  }

  const SAFE_ERROR_MSG = "משהו השתבש. אנא פנה/י למספרה.";

  async function handleInbound(): Promise<NextResponse> {
    if (!From || !MessageSid) {
      try {
        await updateInboundDoc(inboundId, { status: "error", errorMessage: "Missing From or MessageSid" });
      } catch {
        // ignore
      }
      return xmlResponse(twimlMessage(From || "", SAFE_ERROR_MSG));
    }

    const fromE164 = normalizeE164(From.replace(/^whatsapp:/, ""), "IL");

    await logInboundWhatsApp({
      fromPhone: From,
      toPhone: To,
      body: Body,
      twilioMessageSid: MessageSid,
    });

    const { intent, selection } = normalizeInbound(Body);

    const sendReply = async (replyBody: string) => {
      try {
        await sendWhatsApp({ toE164: fromE164, body: replyBody });
      } catch (e) {
        console.error("[WA_WEBHOOK] sendWhatsApp failed", { inboundId, error: e });
      }
    };

    if (selection !== null) {
      const session = await getWhatsAppSession(fromE164);
      if (!session) {
        const reply =
          "לא מצאתי בחירה פעילה. אנא השב/י שוב על הודעת התזכורת עם כן או לא.";
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }
      const n = selection;
      const choices = session.choices;
      console.log("[WA_WEBHOOK] selection_received", { phoneE164: fromE164, n });
      if (n < 1 || n > choices.length) {
        const reply = `מספר לא תקין. אנא השב/י עם מספר בין 1 ל-${choices.length}.`;
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }
      const chosen = choices[n - 1]!;
      const booking = await getBookingByRefIfAwaitingConfirmation(chosen.bookingRef);
      if (!booking) {
        const reply =
          "נראה שהתור הזה כבר עודכן. אם צריך עזרה, דבר/י עם העסק.";
        await sendReply(reply);
        await deleteWhatsAppSession(fromE164);
        return xmlResponse(twimlMessage(From, reply));
      }
      if (session.intent === "confirm") {
        await markBookingConfirmed(booking.siteId, booking.bookingId);
        console.log("[WA_WEBHOOK] selection_applied", {
          bookingRef: chosen.bookingRef,
          intent: "confirm",
        });
        const timeStr = formatIsraelTime(booking.startAt);
        const reply = `אושר ✅ נתראה ב-${timeStr} אצל ${booking.salonName}.`;
        await sendReply(reply);
        await deleteWhatsAppSession(fromE164);
        return xmlResponse(twimlMessage(From, reply));
      }
      await markBookingCancelledByWhatsApp(booking.siteId, booking.bookingId);
      console.log("[WA_WEBHOOK] selection_applied", {
        bookingRef: chosen.bookingRef,
        intent: "cancel",
      });
      const reply = `בוטל ✅. אם תרצה/י לקבוע מחדש, דבר/י עם ${booking.salonName}.`;
      await sendReply(reply);
      await deleteWhatsAppSession(fromE164);
      return xmlResponse(twimlMessage(From, reply));
    }

    if (intent === "yes" || intent === "no") {
      const matches = await findBookingsAwaitingConfirmationByPhoneMulti(fromE164, 5);
      console.log("[WA_WEBHOOK] matches_count", { phoneE164: fromE164, count: matches.length });

      if (matches.length === 0) {
        try {
          await updateInboundDoc(inboundId, { status: "no_booking" });
        } catch {
          // ignore
        }
        if (intent === "yes") {
          const alreadyConfirmed = await findNextBookingByPhoneWithStatus(fromE164, "confirmed");
          if (alreadyConfirmed) {
            const reply = "התור כבר מאושר 😊";
            await sendReply(reply);
            return xmlResponse(twimlMessage(From, reply));
          }
        }
        if (intent === "no") {
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

      if (matches.length === 1) {
        const choice = matches[0]!;
        const bookingRef = choice.bookingRef;
        console.log("[WA_WEBHOOK] booking_found", { inboundId, bookingRef });
        if (intent === "yes") {
          await markBookingConfirmed(choice.siteId, choice.bookingId);
          console.log("[WA_WEBHOOK] booking_updated", {
            inboundId,
            bookingRef,
            newStatus: "confirmed",
          });
          try {
            await updateInboundDoc(inboundId, { status: "matched_yes", bookingRef });
          } catch {
            // ignore
          }
          const timeStr = formatIsraelTime(choice.startAt.toDate());
          const reply = `אושר ✅ נתראה ב-${timeStr} ב-${choice.siteName}.`;
          await sendReply(reply);
          return xmlResponse(twimlMessage(From, reply));
        }
        await markBookingCancelledByWhatsApp(choice.siteId, choice.bookingId);
        console.log("[WA_WEBHOOK] booking_updated", {
          inboundId,
          bookingRef,
          newStatus: "cancelled",
        });
        try {
          await updateInboundDoc(inboundId, { status: "matched_no", bookingRef });
        } catch {
          // ignore
        }
        const reply = "הבנתי, ביטלתי את התור.";
        await sendReply(reply);
        return xmlResponse(twimlMessage(From, reply));
      }

      const choices = matches.slice(0, 5);
      await createWhatsAppSession({
        phoneE164: fromE164,
        intent: intent === "yes" ? "confirm" : "cancel",
        choices,
        lastInboundMessageSid: MessageSid,
        lastInboundBody: Body,
      });
      console.log("[WA_WEBHOOK] session_saved", {
        phoneE164: fromE164,
        count: choices.length,
        intent: intent === "yes" ? "confirm" : "cancel",
      });
      await logAmbiguousWhatsApp({
        fromPhone: From,
        toPhone: To,
        body: Body,
        twilioMessageSid: MessageSid,
        bookingRefs: choices.map((c) => c.bookingRef),
      });
      try {
        await updateInboundDoc(inboundId, {
          status: "ambiguous",
          errorMessage: `Multiple bookings: ${choices.map((c) => c.bookingRef).join(", ")}`,
        });
      } catch {
        // ignore
      }
      const lines = choices.map((c, i) => {
        const { dateStr, timeStr } = formatIsraelDateTime(c.startAt);
        const servicePart = c.serviceName ? ` ${c.serviceName}` : "";
        return `${i + 1}) ${dateStr} ${timeStr} – ${c.siteName}${servicePart}`;
      });
      const list = lines.join("\n");
      const reply = `יש לך כמה תורים שממתינים לאישור. על איזה מהם מדובר?\n\n${list}\n\nהשב/י עם מספר (1-${choices.length}).`;
      await sendReply(reply);
      return xmlResponse(twimlMessage(From, reply));
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
