/**
 * POST /api/webhooks/twilio/whatsapp
 * Inbound WhatsApp webhook. Validate Twilio signature (SDK with parsed params from raw body),
 * log to whatsapp_inbound. Handles YES/NO and selection menu (multiple bookings).
 */

import { NextRequest, NextResponse } from "next/server";
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
import {
  getInboundByMessageSid,
  tryClaimInbound,
  setInboundProcessed,
  writeInboundReceived,
  writeInboundSignatureFailed,
  updateInboundDoc,
} from "@/lib/whatsapp/inboundLog";
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

function emptyResponse(messageSid?: string): NextResponse {
  console.log("[WA_WEBHOOK] http_200_empty", messageSid != null ? { messageSid } : {});
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  console.log("[WA_WEBHOOK] start", { ts: new Date().toISOString() });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[WA_WEBHOOK] missing TWILIO_AUTH_TOKEN");
    return xmlResponse(twimlMessage("", "משהו השתבש. אנא פנה/י למספרה."), 200);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[WA_WEBHOOK] failed to read body", { error: e });
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
        if (MessageSid) await writeInboundSignatureFailed(MessageSid, { from: From, to: To, body: Body });
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

  const fromE164 = normalizeE164(From.replace(/^whatsapp:/, ""), "IL");
  const docId = MessageSid || `no-sid-${Date.now()}`;
  if (!MessageSid) {
    console.warn("[WA_WEBHOOK] missing MessageSid, using fallback", { docId });
  } else {
    const existing = await getInboundByMessageSid(MessageSid);
    if (existing?.processedAt != null) {
      console.log("[WA_WEBHOOK] dedupe_hit", { messageSid: MessageSid });
      return emptyResponse(docId);
    }
    const claimed = await tryClaimInbound(MessageSid, { fromE164, to: To, body: Body });
    if (!claimed) {
      console.log("[WA_WEBHOOK] dedupe_hit", { messageSid: MessageSid });
      return emptyResponse(docId);
    }
  }

  if (!MessageSid) {
    try {
      await writeInboundReceived(docId, { messageSid: "", fromE164, to: To, body: Body });
    } catch (e) {
      console.error("[WA_WEBHOOK] failed to write inbound received", e);
    }
  }

  console.log("[WA_WEBHOOK] inbound_received", { messageSid: docId });

  try {
    return await handleInbound();
  } catch (err) {
    const errObj = err as { code?: number; message?: string; name?: string; stack?: string };
    const errCode = errObj?.code;
    const errMessage = errObj?.message ?? String(err);
    const isIndexError = errCode === 9 && /index/i.test(errMessage);

    console.error("[WA_WEBHOOK] error", {
      messageSid: docId,
      from: From,
      body: Body,
      errName: errObj?.name,
      errCode: errCode ?? null,
      errMessage,
      errStack: errObj?.stack ?? null,
    });
    if (isIndexError) {
      console.error("[WA_WEBHOOK] missing_index", { messageSid: docId, errMessage });
    }
    const errorReply = isIndexError
      ? "System needs a database index. Please contact the salon."
      : "משהו השתבש. אנא פנה/י למספרה.";
    try {
      await setInboundProcessed(docId, {
        resultStatus: isIndexError ? "missing_index" : "error",
        replyBody: errorReply,
        error: errMessage,
      });
      await updateInboundDoc(docId, {
        status: isIndexError ? "missing_index" : "error",
        errorCode: errCode ?? null,
        errorMessage: errMessage,
        errorStack: errObj?.stack ?? null,
      });
    } catch {
      // ignore
    }
    try {
      await sendWhatsApp({ toE164: fromE164, body: errorReply });
    } catch (e) {
      console.error("[WA_WEBHOOK] sendWhatsApp failed", { messageSid: docId, error: e });
    }
    return emptyResponse(docId);
  }

  const SAFE_ERROR_MSG = "משהו השתבש. אנא פנה/י למספרה.";

  async function handleInbound(): Promise<NextResponse> {
    if (!From || !MessageSid) {
      try {
        await updateInboundDoc(docId, { status: "error", errorMessage: "Missing From or MessageSid" });
      } catch {
        // ignore
      }
      return emptyResponse(docId);
    }

    await logInboundWhatsApp({
      fromPhone: From,
      toPhone: To,
      body: Body,
      twilioMessageSid: MessageSid,
    });

    const { intent, selection } = normalizeInbound(Body);

    async function recordAndSendReply(
      replyBody: string,
      resultStatus: string,
      bookingRef?: string | null
    ): Promise<void> {
      await setInboundProcessed(docId, { resultStatus, replyBody, bookingRef });
      console.log("[WA_WEBHOOK] replying_once", { messageSid: docId });
      try {
        await sendWhatsApp({ toE164: fromE164, body: replyBody });
      } catch (e) {
        console.error("[WA_WEBHOOK] sendWhatsApp failed", { messageSid: docId, error: e });
      }
      console.log("[WA_WEBHOOK] replied", { messageSid: docId });
    }

    if (selection !== null) {
      const session = await getWhatsAppSession(fromE164);
      if (!session) {
        const reply =
          "לא מצאתי בחירה פעילה. אנא השב/י שוב על הודעת התזכורת עם כן או לא.";
        await recordAndSendReply(reply, "no_session");
        return emptyResponse(docId);
      }
      const n = selection;
      const choices = session.choices;
      console.log("[WA_WEBHOOK] selection_received", { phoneE164: fromE164, n });
      if (n < 1 || n > choices.length) {
        const reply = `מספר לא תקין. אנא השב/י עם מספר בין 1 ל-${choices.length}.`;
        await recordAndSendReply(reply, "invalid_selection");
        return emptyResponse(docId);
      }
      const chosen = choices[n - 1]!;
      const booking = await getBookingByRefIfAwaitingConfirmation(chosen.bookingRef);
      if (!booking) {
        const reply =
          "נראה שהתור הזה כבר עודכן. אם צריך עזרה, דבר/י עם העסק.";
        await deleteWhatsAppSession(fromE164);
        await recordAndSendReply(reply, "booking_updated");
        return emptyResponse(docId);
      }
      if (session.intent === "confirm") {
        await markBookingConfirmed(booking.siteId, booking.bookingId);
        console.log("[WA_WEBHOOK] selection_applied", {
          bookingRef: chosen.bookingRef,
          intent: "confirm",
        });
        const timeStr = formatIsraelTime(booking.startAt);
        const reply = `אושר ✅ נתראה ב-${timeStr} אצל ${booking.salonName}.`;
        await deleteWhatsAppSession(fromE164);
        await recordAndSendReply(reply, "matched_yes", chosen.bookingRef);
        return emptyResponse(docId);
      }
      await markBookingCancelledByWhatsApp(booking.siteId, booking.bookingId);
      console.log("[WA_WEBHOOK] selection_applied", {
        bookingRef: chosen.bookingRef,
        intent: "cancel",
      });
      const reply = `בוטל ✅. אם תרצה/י לקבוע מחדש, דבר/י עם ${booking.salonName}.`;
      await deleteWhatsAppSession(fromE164);
      await recordAndSendReply(reply, "matched_no", chosen.bookingRef);
      return emptyResponse(docId);
    }

    if (intent === "yes" || intent === "no") {
      const matches = await findBookingsAwaitingConfirmationByPhoneMulti(fromE164, 5);
      console.log("[WA_WEBHOOK] matches_count", { phoneE164: fromE164, count: matches.length });

      if (matches.length === 0) {
        if (intent === "yes") {
          const alreadyConfirmed = await findNextBookingByPhoneWithStatus(fromE164, "confirmed");
          if (alreadyConfirmed) {
            await recordAndSendReply("התור כבר מאושר 😊", "no_booking");
            return emptyResponse(docId);
          }
        }
        if (intent === "no") {
          const alreadyCancelled = await findNextBookingByPhoneWithStatus(fromE164, "cancelled");
          if (alreadyCancelled) {
            await recordAndSendReply("התור כבר בוטל.", "no_booking");
            return emptyResponse(docId);
          }
        }
        const reply =
          "לא מצאתי תור שממתין לאישור עבור המספר הזה. אם קבעת תור, אפשר לפנות למספרה.";
        await recordAndSendReply(reply, "no_booking");
        return emptyResponse(docId);
      }

      if (matches.length === 1) {
        const choice = matches[0]!;
        const bookingRef = choice.bookingRef;
        console.log("[WA_WEBHOOK] booking_found", { messageSid: docId, bookingRef });
        if (intent === "yes") {
          await markBookingConfirmed(choice.siteId, choice.bookingId);
          console.log("[WA_WEBHOOK] booking_updated", {
            messageSid: docId,
            bookingRef,
            newStatus: "confirmed",
          });
          const timeStr = formatIsraelTime(choice.startAt.toDate());
          const reply = `אושר ✅ נתראה ב-${timeStr} ב-${choice.siteName}.`;
          await recordAndSendReply(reply, "matched_yes", bookingRef);
          return emptyResponse(docId);
        }
        await markBookingCancelledByWhatsApp(choice.siteId, choice.bookingId);
        console.log("[WA_WEBHOOK] booking_updated", {
          messageSid: docId,
          bookingRef,
          newStatus: "cancelled",
        });
        await recordAndSendReply("הבנתי, ביטלתי את התור.", "matched_no", bookingRef);
        return emptyResponse(docId);
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
      const lines = choices.map((c, i) => {
        const { dateStr, timeStr } = formatIsraelDateTime(c.startAt);
        const servicePart = c.serviceName ? ` ${c.serviceName}` : "";
        return `${i + 1}) ${dateStr} ${timeStr} – ${c.siteName}${servicePart}`;
      });
      const list = lines.join("\n");
      const reply = `יש לך כמה תורים שממתינים לאישור. על איזה מהם מדובר?\n\n${list}\n\nהשב/י עם מספר (1-${choices.length}).`;
      await recordAndSendReply(reply, "ambiguous");
      return emptyResponse(docId);
    }

    const help = 'כדי לאשר תור השב/השיבי "כן", כדי לבטל השב/השיבי "לא".';
    await recordAndSendReply(help, "no_match");
    return emptyResponse(docId);
  }
}
