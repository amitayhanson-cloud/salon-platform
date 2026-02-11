/**
 * POST /api/webhooks/twilio/whatsapp
 * Inbound WhatsApp webhook. Validate Twilio signature (raw body), log message,
 * handle YES/NO confirmation. Replies sent via Twilio API and logged to Firestore.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateTwilioSignature,
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
import { formatIsraelTime } from "@/lib/datetime/formatIsraelTime";

const WEBHOOK_PATH = "/api/webhooks/twilio/whatsapp";

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const fullUrl = getWebhookUrl(WEBHOOK_PATH, request);
  const skipSignature =
    process.env.NODE_ENV !== "production" && process.env.SKIP_TWILIO_SIGNATURE === "true";
  if (!skipSignature && !validateTwilioSignature(authToken, signature, fullUrl, rawBody)) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const params = new URLSearchParams(rawBody);
  const from = params.get("From")?.trim() ?? "";
  const to = params.get("To")?.trim() ?? "";
  const body = (params.get("Body") ?? "").trim();
  const messageSid = params.get("MessageSid")?.trim() ?? "";

  if (!from || !messageSid) {
    return NextResponse.json({ error: "Missing From or MessageSid" }, { status: 400 });
  }

  const fromE164 = normalizeE164(from.replace(/^whatsapp:/, ""), "IL");

  await logInboundWhatsApp({
    fromPhone: from,
    toPhone: to,
    body,
    twilioMessageSid: messageSid,
  });

  const isYesReply = isYes(body);
  const isNoReply = isNo(body);

  if (isYesReply || isNoReply) {
    const { bookings, count } = await findAwaitingConfirmationByPhone(fromE164);
    console.log("[whatsapp-webhook]", { fromE164, foundCount: count, bookingRef: count === 1 ? `sites/${bookings[0].siteId}/bookings/${bookings[0].id}` : null });

    if (count === 0) {
      if (isYesReply) {
        const alreadyConfirmed = await findNextBookingByPhoneWithStatus(fromE164, "confirmed");
        if (alreadyConfirmed) {
          await sendWhatsApp({ toE164: fromE164, body: "התור כבר מאושר 😊" });
          return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { "Content-Type": "text/xml" },
          });
        }
      }
      if (isNoReply) {
        const alreadyCancelled = await findNextBookingByPhoneWithStatus(fromE164, "cancelled");
        if (alreadyCancelled) {
          await sendWhatsApp({ toE164: fromE164, body: "התור כבר בוטל." });
          return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { "Content-Type": "text/xml" },
          });
        }
      }
      const reply =
        "לא מצאתי תור שממתין לאישור עבור המספר הזה. אם קבעת תור, אפשר לפנות למספרה.";
      await sendWhatsApp({ toE164: fromE164, body: reply });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (count > 1) {
      const bookingRefs = bookings.map((b) => `sites/${b.siteId}/bookings/${b.id}`);
      await logAmbiguousWhatsApp({
        fromPhone: from,
        toPhone: to,
        body,
        twilioMessageSid: messageSid,
        bookingRefs,
      });
      const reply =
        "יש לך יותר מתור אחד שממתין לאישור. אנא פנה למספרה עם שעת התור שברצונך לאשר או לבטל.";
      await sendWhatsApp({ toE164: fromE164, body: reply });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const booking = bookings[0];
    const bookingRef = `sites/${booking.siteId}/bookings/${booking.id}`;

    if (isYesReply) {
      await markBookingConfirmed(booking.siteId, booking.id);
      console.log("[whatsapp-webhook] booking updated", { bookingRef, newStatus: "confirmed" });
      const timeStr = formatIsraelTime(booking.startAt);
      const reply = `אושר ✅ נתראה ב-${timeStr} ב-${booking.salonName}.`;
      await sendWhatsApp({
        toE164: fromE164,
        body: reply,
        bookingId: booking.id,
        siteId: booking.siteId,
        bookingRef,
      });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (isNoReply) {
      await markBookingCancelledByWhatsApp(booking.siteId, booking.id);
      console.log("[whatsapp-webhook] booking updated", { bookingRef, newStatus: "cancelled" });
      const reply = "הבנתי, ביטלתי את התור.";
      await sendWhatsApp({
        toE164: fromE164,
        body: reply,
        bookingId: booking.id,
        siteId: booking.siteId,
        bookingRef,
      });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }
  }

  const help = 'כדי לאשר תור השב/השיבי "כן", כדי לבטל השב/השיבי "לא".';
  await sendWhatsApp({ toE164: fromE164, body: help });
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
