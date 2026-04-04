/**
 * POST /api/webhooks/whatsapp
 * Inbound WhatsApp webhook (Twilio). Idempotent by MessageSid; always HTTP 200 with TwiML.
 * Unknown inbound → empty TwiML Response (no outbound message, no quota). Metered replies call incrementWhatsAppUsage(siteId, "service") only when siteId is known.
 *
 * Legacy path `/api/webhooks/twilio/whatsapp` re-exports this handler.
 */

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import {
  getWebhookUrl,
  logInboundWhatsApp,
  logAmbiguousWhatsApp,
  normalizeE164,
  normalizeInbound,
  isBroadcastWaitlistOptOut,
  intentFromInteractiveTemplate,
  findBookingsAwaitingConfirmationByPhoneMulti,
  markBookingConfirmed,
  getBookingByRefIfAwaitingConfirmation,
  createWhatsAppSession,
  getWhatsAppSession,
  deleteWhatsAppSession,
  getRelatedBookingIds,
  applyCancelledByWhatsAppToBooking,
  assertSiteWithinWhatsAppLimit,
  incrementWhatsAppUsage,
  siteIdFromBookingRef,
  writeWhatsAppAuditLog,
  inferAuditTypeFromTwiMLReply,
  bookingIdFromBookingRef,
} from "@/lib/whatsapp";
import { markUnsubscribedByPhone } from "@/lib/marketing/markUnsubscribedByPhone";
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
import { formatIsraelDateTime } from "@/lib/datetime/formatIsraelTime";
import {
  buildClientCancelSystemFallbackText,
  buildClientConfirmSystemFallbackText,
} from "@/lib/whatsapp/inboundReplyFallbackText";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { looksLikeCustomerBookingConfirmationRequest } from "@/lib/whatsapp/optInConfirmationPattern";
import { findRecentBookingForWaOptInConfirmation } from "@/lib/whatsapp/findRecentBookingForOptInConfirmation";
import { getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import {
  bookingStartAtFromFirestore,
  renderBookingConfirmationMessageFromBookingData,
} from "@/lib/whatsapp/renderBookingConfirmationMessage";
import { fetchWazeUrlForSite } from "@/lib/whatsapp/fetchWazeUrlForSite";
import { getPublicBookingPageAbsoluteUrlForSite, withTrackingSource } from "@/lib/url";
import { clearWaOptInPending } from "@/lib/whatsapp/waOptInPending";
import {
  findNotifiedWaitlistOfferForPhone,
  fulfillWaitlistOfferFromInboundYes,
  declineWaitlistOffer,
} from "@/lib/bookingWaitlist/fulfillOfferFromYes";

const WEBHOOK_PATH = "/api/webhooks/whatsapp";

/** TwiML with no outbound message — avoids spending quota on unknown inbound. */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio sandbox: user must send `join <code>` before messaging the sandbox number. */
function isSandboxJoinCommand(body: string): boolean {
  const sandbox = (process.env.TWILIO_WHATSAPP_SANDBOX_MODE ?? "").toLowerCase() === "true";
  const code = (process.env.TWILIO_WHATSAPP_SANDBOX_JOIN_CODE ?? "").trim();
  if (!sandbox || !code) return false;
  const normalized = body.trim().toLowerCase().replace(/\s+/g, " ");
  const expected = `join ${code.toLowerCase()}`;
  return normalized === expected || normalized.startsWith(`${expected} `);
}

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

export async function POST(request: NextRequest) {
  console.log("Webhook triggered!");
  console.log("[WA_WEBHOOK] start", { ts: new Date().toISOString() });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[WA_WEBHOOK] missing TWILIO_AUTH_TOKEN");
    return xmlResponse(EMPTY_TWIML, 200);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[WA_WEBHOOK] failed to read body", { error: e });
    return xmlResponse(EMPTY_TWIML, 200);
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
      return xmlResponse(EMPTY_TWIML, 200);
    }
  }

  const From = String(twilioParams["From"] ?? "").trim();
  const To = String(twilioParams["To"] ?? "").trim();
  const Body = String(twilioParams["Body"] ?? "").trim();
  const ButtonText = String(twilioParams["ButtonText"] ?? "").trim();
  const ButtonPayload = String(twilioParams["ButtonPayload"] ?? "").trim();
  const MessageSid = String(
    twilioParams["MessageSid"] ?? twilioParams["SmsMessageSid"] ?? twilioParams["SmsSid"] ?? ""
  ).trim();
  const fromE164 = normalizeE164(From.replace(/^whatsapp:/, ""), "IL");
  const docId = MessageSid || `no-sid-${Date.now()}`;
  if (!MessageSid) {
    console.warn("[WA_WEBHOOK] missing MessageSid, using fallback", { docId });
  } else {
    const existing = await getInboundByMessageSid(MessageSid);
    if (isInboundProcessed(existing)) {
      const storedTwiml =
        existing!.twimlResponse ||
        (existing!.replyBody?.trim() ? buildTwimlResponse(existing!.replyBody.trim()) : EMPTY_TWIML);
      console.log("[WA_WEBHOOK] dedupe_hit", { messageSid: MessageSid });
      return xmlResponse(storedTwiml, 200);
    }
    const claimed = await tryClaimInbound(MessageSid, { fromE164, to: To, body: Body });
    if (!claimed) {
      const again = await getInboundByMessageSid(MessageSid);
      const replayBody = again?.replyBody?.trim();
      const storedTwiml =
        again?.twimlResponse || (replayBody ? buildTwimlResponse(replayBody) : EMPTY_TWIML);
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

  /** Prefer `Body` over `ButtonText` so the full prefilled opt-in line is not replaced by a short button label. */
  const inboundBody = Body || ButtonText;
  console.log("[WA_WEBHOOK] parsed", { messageSid: docId, from: From, body: inboundBody, buttonPayload: ButtonPayload || undefined });

  try {
    return await handleInbound();
  } catch (err) {
    const errObj = err as { code?: number; message?: string; name?: string; stack?: string };
    const errCode = errObj?.code;
    const errMessage = errObj?.message ?? String(err);
    const isIndexError =
      /the query requires an index/i.test(errMessage) ||
      (/FAILED_PRECONDITION/i.test(errMessage) && /index|collection group|composite/i.test(errMessage)) ||
      (errCode === 9 && /index|collection group|composite/i.test(errMessage));

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
    const twimlStr = EMPTY_TWIML;
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
      return xmlResponse(EMPTY_TWIML, 200);
    }

    await logInboundWhatsApp({
      fromPhone: From,
      toPhone: To,
      body: inboundBody,
      twilioMessageSid: MessageSid,
    });

    const { intent: parsedIntent, selection } = normalizeInbound(inboundBody, ButtonPayload || null);
    /** Reminder/broadcast template buttons: Twilio puts the label on ButtonText; Body may be empty. */
    const intent = intentFromInteractiveTemplate(Body, ButtonText, ButtonPayload) ?? parsedIntent;

    if (
      isBroadcastWaitlistOptOut(Body) ||
      isBroadcastWaitlistOptOut(ButtonText) ||
      isBroadcastWaitlistOptOut(ButtonPayload)
    ) {
      try {
        const hits = await markUnsubscribedByPhone(fromE164);
        console.log("[WA_WEBHOOK] unsubscribed", { fromE164, updated: hits, waitlistOptOut: true });
      } catch (e) {
        console.error("[WA_WEBHOOK] unsubscribe_failed", e);
      }
      return recordSilent("unsubscribed");
    }

    async function recordSilent(
      resultStatus: string,
      options: { bookingRef?: string | null; action?: "confirmed" | "cancelled" | null } = {}
    ): Promise<NextResponse> {
      await setInboundProcessed(docId, {
        resultStatus,
        replyBody: "",
        twimlResponse: EMPTY_TWIML,
        bookingRef: options.bookingRef,
        action: options.action,
      });
      console.log("[WA_WEBHOOK] silent_reply", { messageSid: docId, resultStatus });
      return xmlResponse(EMPTY_TWIML, 200);
    }

    /** Sandbox join: reply without metering (no siteId). */
    async function recordSandboxJoinAck(): Promise<NextResponse> {
      const msg =
        (process.env.TWILIO_WHATSAPP_SANDBOX_JOIN_ACK ?? "").trim() ||
        "מחוברים לסביבת הבדיקה של WhatsApp. אפשר להמשיך.";
      const twimlStr = buildTwimlResponse(msg);
      await setInboundProcessed(docId, {
        resultStatus: "sandbox_join",
        replyBody: msg,
        twimlResponse: twimlStr,
      });
      console.log("[WA_WEBHOOK] sandbox_join_ack", { messageSid: docId });
      return xmlResponse(twimlStr, 200);
    }

    /**
     * Outbound TwiML with text: requires a resolvable siteId for limit check + incrementWhatsAppUsage(..., "service").
     * Empty body → silent (no increment).
     */
    async function recordAndReturnReply(
      replyBody: string,
      resultStatus: string,
      options: {
        bookingRef?: string | null;
        action?: "confirmed" | "cancelled" | null;
        meterSiteId?: string | null;
      } = {}
    ): Promise<NextResponse> {
      const text = (replyBody ?? "").trim();
      if (!text) {
        return recordSilent(resultStatus, options);
      }
      const siteId =
        (options.meterSiteId && options.meterSiteId.trim()) ||
        siteIdFromBookingRef(options.bookingRef ?? undefined);
      if (!siteId) {
        console.warn("[WA_WEBHOOK] reply_suppressed_no_site", { messageSid: docId, resultStatus });
        return recordSilent(resultStatus, options);
      }
      const { allowed } = await assertSiteWithinWhatsAppLimit(siteId);
      if (!allowed) {
        console.warn("[WA_WEBHOOK] Limit Reached (inbound reply blocked)", {
          siteId,
          messageSid: docId,
        });
        await setInboundProcessed(docId, {
          resultStatus: "usage_limit_blocked",
          replyBody: "",
          twimlResponse: EMPTY_TWIML,
          bookingRef: options.bookingRef,
          action: options.action,
        });
        return xmlResponse(EMPTY_TWIML, 200);
      }
      try {
        await incrementWhatsAppUsage(siteId, "service");
      } catch (e) {
        console.warn("[WA_WEBHOOK] usage increment failed", e);
      }
      try {
        const auditType = inferAuditTypeFromTwiMLReply(resultStatus);
        await writeWhatsAppAuditLog(siteId, {
          type: auditType,
          channel: "twiml",
          bookingRef: options.bookingRef ?? null,
          bookingId: bookingIdFromBookingRef(options.bookingRef ?? undefined),
          replyContext: resultStatus,
        });
      } catch (e) {
        console.warn("[WA_WEBHOOK] whatsapp_logs audit write failed", e);
      }
      const twimlStr = buildTwimlResponse(text);
      await setInboundProcessed(docId, {
        resultStatus,
        replyBody: text,
        twimlResponse: twimlStr,
        bookingRef: options.bookingRef,
        action: options.action,
      });
      console.log("[WA_WEBHOOK] reply_sent", { messageSid: docId, siteId });
      return xmlResponse(twimlStr, 200);
    }

    if (isSandboxJoinCommand(inboundBody)) {
      return recordSandboxJoinAck();
    }

    if (selection !== null) {
      const session = await getWhatsAppSession(fromE164);
      if (!session) {
        return recordSilent("no_session");
      }
      const n = selection;
      const choices = session.choices;
      console.log("[WA_WEBHOOK] matched_number", { phoneE164: fromE164, n });
      if (n < 1 || n > choices.length) {
        return recordSilent("invalid_selection");
      }
      const chosen = choices[n - 1]!;
      const booking = await getBookingByRefIfAwaitingConfirmation(chosen.bookingRef);
      if (!booking) {
        await deleteWhatsAppSession(fromE164);
        return recordSilent("booking_updated");
      }
      if (session.intent === "confirm") {
        await markBookingConfirmed(booking.siteId, booking.bookingId);
        console.log("[WA_WEBHOOK] firestore_updated", {
          bookingRef: chosen.bookingRef,
          action: "confirmed",
        });
        const reply = buildClientConfirmSystemFallbackText({
          time: formatIsraelDateTime(booking.startAt).timeStr,
          businessName: booking.salonName,
          wazeUrl: (await fetchWazeUrlForSite(booking.siteId)) ?? "",
        });
        await deleteWhatsAppSession(fromE164);
        return recordAndReturnReply(reply, "matched_yes", {
          bookingRef: chosen.bookingRef,
          action: "confirmed",
        });
      }
      await cancelGroupByMatchedBooking(booking.siteId, booking.bookingId);
      console.log("[WA_WEBHOOK] firestore_updated", {
        bookingRef: chosen.bookingRef,
        action: "cancelled",
      });
      const reply = buildClientCancelSystemFallbackText(booking.salonName);
      await deleteWhatsAppSession(fromE164);
      return recordAndReturnReply(reply, "matched_no", {
        bookingRef: chosen.bookingRef,
        action: "cancelled",
      });
    }

    // Run even when normalizeInbound guessed "yes"/"no" — prefilled opt-in text can contain
    // words that overlap YES/NO heuristics (e.g. "אישור", or "כן" inside longer phrases).
    if (selection === null && looksLikeCustomerBookingConfirmationRequest(inboundBody)) {
      const optInMatch = await findRecentBookingForWaOptInConfirmation(fromE164);
      if (optInMatch) {
        const { siteId: optSiteId, bookingId: optBookingId, data: bookingData } = optInMatch;
        const optBookingRefPath = `sites/${optSiteId}/bookings/${optBookingId}`;
        try {
          const waSettings = await getSiteWhatsAppSettings(optSiteId);
          if (!waSettings.confirmationEnabled) {
            return recordSilent("opt_in_confirmation_disabled");
          }
          const startAt = bookingStartAtFromFirestore(bookingData);
          if (!startAt) {
            console.error("[WA_WEBHOOK] opt_in_missing_startAt", { optSiteId, optBookingId });
            return recordSilent("opt_in_bad_startat");
          }
          const db = getAdminDb();
          const bookingRef = db
            .collection("sites")
            .doc(optSiteId)
            .collection("bookings")
            .doc(optBookingId);
          const fresh = (await bookingRef.get()).data() as Record<string, unknown> | undefined;
          if (fresh?.confirmationSentAt != null) {
            await clearWaOptInPending(From);
            return recordSilent("opt_in_already_sent");
          }
          const siteSnap = await db.collection("sites").doc(optSiteId).get();
          const cfg = siteSnap.data()?.config as { salonName?: string; whatsappBrandName?: string } | undefined;
          const salonName = cfg?.salonName ?? cfg?.whatsappBrandName ?? "הסלון";
          const slug = typeof siteSnap.data()?.slug === "string" ? siteSnap.data()?.slug : null;
          const [wazeUrl] = await Promise.all([fetchWazeUrlForSite(optSiteId)]);
          const bookingPublicUrl = withTrackingSource(
            getPublicBookingPageAbsoluteUrlForSite(optSiteId, slug),
            "whatsapp"
          );
          const customerDisplayName = String(bookingData.customerName ?? "").trim() || "לקוח/ה";
          const replyBody = renderBookingConfirmationMessageFromBookingData(waSettings, {
            salonName,
            bookingPublicUrl,
            customerDisplayName,
            startAt,
            wazeUrl: wazeUrl ?? "",
          });
          await bookingRef.update({
            confirmationSentAt: Timestamp.now(),
            whatsappStatus: "booked",
            updatedAt: Timestamp.now(),
          });
          await clearWaOptInPending(From);
          return recordAndReturnReply(replyBody, "opt_in_booking_confirmation", {
            bookingRef: optBookingRefPath,
          });
        } catch (optErr) {
          const msg = optErr instanceof Error ? optErr.message : String(optErr);
          console.error("[WA_WEBHOOK] opt_in_handler_error", { optSiteId, optBookingId, msg });
          return recordSilent("opt_in_handler_error");
        }
      }
      return recordSilent("opt_in_no_booking_match");
    }

    if (intent === "yes" || intent === "no") {
      const matches = await findBookingsAwaitingConfirmationByPhoneMulti(fromE164, 5);
      console.log("[WA_WEBHOOK] matches_count", { phoneE164: fromE164, count: matches.length });

      if (matches.length === 0) {
        const waitlistMatch = await findNotifiedWaitlistOfferForPhone(fromE164);
        if (waitlistMatch) {
          if (intent === "yes") {
            const result = await fulfillWaitlistOfferFromInboundYes(waitlistMatch.siteId, waitlistMatch.id);
            if (result.ok) {
              return recordAndReturnReply(result.confirmReply, "waitlist_booked", {
                meterSiteId: waitlistMatch.siteId,
              });
            }
            if (result.customerReply) {
              return recordAndReturnReply(result.customerReply, "waitlist_offer_failed", {
                meterSiteId: waitlistMatch.siteId,
              });
            }
            return recordSilent("waitlist_offer_failed");
          }
          const { reply } = await declineWaitlistOffer(waitlistMatch.siteId, waitlistMatch.id);
          return recordAndReturnReply(reply, "waitlist_declined", {
            meterSiteId: waitlistMatch.siteId,
          });
        }
        return recordSilent("no_booking");
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
          const reply = buildClientConfirmSystemFallbackText({
            time: formatIsraelDateTime(choice.startAt.toDate()).timeStr,
            businessName: choice.siteName,
            wazeUrl: (await fetchWazeUrlForSite(choice.siteId)) ?? "",
          });
          return recordAndReturnReply(reply, "matched_yes", {
            bookingRef,
            action: "confirmed",
          });
        }
        await cancelGroupByMatchedBooking(choice.siteId, choice.bookingId);
        console.log("[WA_WEBHOOK] firestore_updated", {
          messageSid: docId,
          bookingRef,
          action: "cancelled",
        });
        const reply = buildClientCancelSystemFallbackText(choice.siteName);
        return recordAndReturnReply(reply, "matched_no", { bookingRef, action: "cancelled" });
      }

      const choices = matches.slice(0, 5);
      await createWhatsAppSession({
        phoneE164: fromE164,
        intent: intent === "yes" ? "confirm" : "cancel",
        choices,
        lastInboundMessageSid: MessageSid,
        lastInboundBody: inboundBody,
      });
      console.log("[WA_WEBHOOK] session_saved", {
        phoneE164: fromE164,
        count: choices.length,
        intent: intent === "yes" ? "confirm" : "cancel",
      });
      await logAmbiguousWhatsApp({
        fromPhone: From,
        toPhone: To,
        body: inboundBody,
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
      return recordAndReturnReply(reply, "ambiguous", { bookingRef: choices[0]!.bookingRef });
    }

    return recordSilent("no_match");
  }
}
