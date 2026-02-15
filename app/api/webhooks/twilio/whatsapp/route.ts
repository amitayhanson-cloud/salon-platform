/**
 * POST /api/webhooks/twilio/whatsapp
 * Inbound WhatsApp webhook. Idempotent by MessageSid; always responds with TwiML and HTTP 200.
 * Validates Twilio signature, logs to whatsapp_inbound, handles YES/NO and selection menu.
 */

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import {
  getWebhookUrl,
  logInboundWhatsApp,
  logAmbiguousWhatsApp,
  normalizeE164,
  normalizeInbound,
  findBookingsAwaitingConfirmationByPhoneMulti,
  findNextBookingByPhoneWithStatus,
  markBookingConfirmed,
  getBookingByRefIfAwaitingConfirmation,
  createWhatsAppSession,
  getWhatsAppSession,
  deleteWhatsAppSession,
  getRelatedBookingIds,
  applyCancelledByWhatsAppToBooking,
} from "@/lib/whatsapp";
import { getAdminProjectId } from "@/lib/firebaseAdmin";
import {
  getInboundByMessageSid,
  isInboundProcessed,
  tryClaimInbound,
  setInboundProcessed,
  setInboundError,
  writeInboundReceived,
  writeInboundSignatureFailed,
  updateInboundDoc,
} from "@/lib/whatsapp/inboundLog";
import { formatIsraelTime, formatIsraelDateTime } from "@/lib/datetime/formatIsraelTime";

const WEBHOOK_PATH = "/api/webhooks/twilio/whatsapp";

/**
 * NO path: cancel/archive ALL group members (same resolver as YES).
 * Resolve members FIRST, then apply cancel to each with for..of await; log per member and final counts.
 */
async function cancelGroupByMatchedBooking(siteId: string, bookingId: string): Promise<void> {
  const adminProjectId = getAdminProjectId();
  console.log("[WA_WEBHOOK] firebase_project (server)", { projectId: adminProjectId ?? "unknown" });

  const { bookingIds } = await getRelatedBookingIds(siteId, bookingId);
  const membersCount = bookingIds.length;
  console.log("[WA_WEBHOOK] group_resolved", { membersCount, memberIds: bookingIds });

  let okCount = 0;
  let failCount = 0;
  for (const id of bookingIds) {
    try {
      await applyCancelledByWhatsAppToBooking(siteId, id);
      okCount++;
      console.log("[WA_WEBHOOK] delete_member", { id, ok: true });
    } catch (e) {
      failCount++;
      const err = e instanceof Error ? e.message : String(e);
      console.log("[WA_WEBHOOK] delete_member", { id, ok: false, err });
    }
  }
  console.log("[WA_WEBHOOK] cancel_done", { membersCount, okCount, failCount });
}

function buildTwimlResponse(body: string): string {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(body);
  return twiml.toString();
}

function xmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

const SAFE_APOLOGY = "משהו השתבש. אנא פנה/י למספרה.";

export async function POST(request: NextRequest) {
  console.log("[WA_WEBHOOK] start", { ts: new Date().toISOString() });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[WA_WEBHOOK] missing TWILIO_AUTH_TOKEN");
    return xmlResponse(buildTwimlResponse(SAFE_APOLOGY), 200);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[WA_WEBHOOK] failed to read body", { error: e });
    return xmlResponse(buildTwimlResponse(SAFE_APOLOGY), 200);
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
      return xmlResponse(buildTwimlResponse("Invalid request."), 200);
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
    if (isInboundProcessed(existing)) {
      const storedTwiml =
        existing!.twimlResponse ||
        buildTwimlResponse(existing!.replyBody || "תשובה נשמרה.");
      console.log("[WA_WEBHOOK] dedupe_hit", { messageSid: MessageSid });
      return xmlResponse(storedTwiml, 200);
    }
    const claimed = await tryClaimInbound(MessageSid, { fromE164, to: To, body: Body });
    if (!claimed) {
      const again = await getInboundByMessageSid(MessageSid);
      const storedTwiml =
        again?.twimlResponse || buildTwimlResponse(again?.replyBody || "תשובה נשמרה.");
      console.log("[WA_WEBHOOK] dedupe_hit", { messageSid: MessageSid });
      return xmlResponse(storedTwiml, 200);
    }
  }

  if (!MessageSid) {
    try {
      await writeInboundReceived(docId, { messageSid: "", fromE164, to: To, body: Body });
    } catch (e) {
      console.error("[WA_WEBHOOK] failed to write inbound received", e);
    }
  }

  console.log("[WA_WEBHOOK] parsed", { messageSid: docId, from: From, body: Body });

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
      : SAFE_APOLOGY;
    const twimlStr = buildTwimlResponse(errorReply);
    try {
      await setInboundError(docId, {
        twimlResponse: twimlStr,
        errorMessage: errMessage,
        errorCode: errCode ?? undefined,
      });
    } catch {
      // ignore
    }
    try {
      await updateInboundDoc(docId, {
        status: isIndexError ? "missing_index" : "error",
        errorCode: errCode ?? null,
        errorMessage: errMessage,
        errorStack: errObj?.stack ?? null,
      });
    } catch {
      // ignore
    }
    return xmlResponse(twimlStr, 200);
  }

  async function handleInbound(): Promise<NextResponse> {
    if (!From || !MessageSid) {
      try {
        await updateInboundDoc(docId, { status: "error", errorMessage: "Missing From or MessageSid" });
      } catch {
        // ignore
      }
      return xmlResponse(buildTwimlResponse(SAFE_APOLOGY), 200);
    }

    await logInboundWhatsApp({
      fromPhone: From,
      toPhone: To,
      body: Body,
      twilioMessageSid: MessageSid,
    });

    const { intent, selection } = normalizeInbound(Body);

    async function recordAndReturnReply(
      replyBody: string,
      resultStatus: string,
      bookingRef?: string | null,
      action?: "confirmed" | "cancelled" | null
    ): Promise<NextResponse> {
      const twimlStr = buildTwimlResponse(replyBody);
      await setInboundProcessed(docId, {
        resultStatus,
        replyBody,
        twimlResponse: twimlStr,
        bookingRef,
        action,
      });
      console.log("[WA_WEBHOOK] reply_sent", { messageSid: docId });
      return xmlResponse(twimlStr, 200);
    }

    if (selection !== null) {
      const session = await getWhatsAppSession(fromE164);
      if (!session) {
        const reply =
          "לא מצאתי בחירה פעילה. אנא השב/י שוב על הודעת התזכורת עם כן או לא.";
        return recordAndReturnReply(reply, "no_session");
      }
      const n = selection;
      const choices = session.choices;
      console.log("[WA_WEBHOOK] matched_number", { phoneE164: fromE164, n });
      if (n < 1 || n > choices.length) {
        const reply = `מספר לא תקין. אנא השב/י עם מספר בין 1 ל-${choices.length}.`;
        return recordAndReturnReply(reply, "invalid_selection");
      }
      const chosen = choices[n - 1]!;
      const booking = await getBookingByRefIfAwaitingConfirmation(chosen.bookingRef);
      if (!booking) {
        const reply =
          "נראה שהתור הזה כבר עודכן. אם צריך עזרה, דבר/י עם העסק.";
        await deleteWhatsAppSession(fromE164);
        return recordAndReturnReply(reply, "booking_updated");
      }
      if (session.intent === "confirm") {
        await markBookingConfirmed(booking.siteId, booking.bookingId);
        console.log("[WA_WEBHOOK] firestore_updated", {
          bookingRef: chosen.bookingRef,
          action: "confirmed",
        });
        const timeStr = formatIsraelTime(booking.startAt);
        const reply = `אושר ✅ נתראה ב-${timeStr} אצל ${booking.salonName}.`;
        await deleteWhatsAppSession(fromE164);
        return recordAndReturnReply(reply, "matched_yes", chosen.bookingRef, "confirmed");
      }
      await cancelGroupByMatchedBooking(booking.siteId, booking.bookingId);
      console.log("[WA_WEBHOOK] firestore_updated", {
        bookingRef: chosen.bookingRef,
        action: "cancelled",
      });
      const reply = `בוטל ✅. אם תרצה/י לקבוע מחדש, דבר/י עם ${booking.salonName}.`;
      await deleteWhatsAppSession(fromE164);
      return recordAndReturnReply(reply, "matched_no", chosen.bookingRef, "cancelled");
    }

    if (intent === "yes" || intent === "no") {
      const matches = await findBookingsAwaitingConfirmationByPhoneMulti(fromE164, 5);
      console.log("[WA_WEBHOOK] matches_count", { phoneE164: fromE164, count: matches.length });

      if (matches.length === 0) {
        if (intent === "yes") {
          const alreadyConfirmed = await findNextBookingByPhoneWithStatus(fromE164, "confirmed");
          if (alreadyConfirmed) {
            return recordAndReturnReply("כבר מאושר ✅", "no_booking");
          }
        }
        if (intent === "no") {
          const alreadyCancelled = await findNextBookingByPhoneWithStatus(fromE164, "cancelled");
          if (alreadyCancelled) {
            return recordAndReturnReply("כבר בוטל ✅", "no_booking");
          }
        }
        const reply =
          "לא מצאתי תור שממתין לאישור עבור המספר הזה. אם קבעת תור, אפשר לפנות למספרה.";
        return recordAndReturnReply(reply, "no_booking");
      }

      if (matches.length === 1) {
        const choice = matches[0]!;
        const bookingRef = choice.bookingRef;
        console.log("[WA_WEBHOOK] matched_yes/no", { messageSid: docId, bookingRef, intent });
        if (intent === "yes") {
          await markBookingConfirmed(choice.siteId, choice.bookingId);
          console.log("[WA_WEBHOOK] firestore_updated", {
            messageSid: docId,
            bookingRef,
            action: "confirmed",
          });
          const timeStr = formatIsraelTime(choice.startAt.toDate());
          const reply = `אושר ✅ נתראה ב-${timeStr} ב-${choice.siteName}.`;
          return recordAndReturnReply(reply, "matched_yes", bookingRef, "confirmed");
        }
        await cancelGroupByMatchedBooking(choice.siteId, choice.bookingId);
        console.log("[WA_WEBHOOK] firestore_updated", {
          messageSid: docId,
          bookingRef,
          action: "cancelled",
        });
        const reply = "הבנתי, ביטלתי את התור.";
        return recordAndReturnReply(reply, "matched_no", bookingRef, "cancelled");
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
      return recordAndReturnReply(reply, "ambiguous");
    }

    const help = 'כדי לאשר תור השב/השיבי "כן", כדי לבטל השב/השיבי "לא".';
    return recordAndReturnReply(help, "no_match");
  }
}
