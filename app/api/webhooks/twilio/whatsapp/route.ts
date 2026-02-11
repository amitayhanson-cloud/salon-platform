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
  sendWhatsApp,
  normalizeE164,
  isYes,
  isNo,
  findNextAwaitingConfirmationByPhone,
  findNextBookingByPhoneWithStatus,
  markBookingConfirmed,
  markBookingCancelledByWhatsApp,
} from "@/lib/whatsapp";

const WEBHOOK_PATH = "/api/webhooks/twilio/whatsapp";

function formatTimeOnly(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Read raw body for signature validation (must be done before parsing)
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

  if (isYes(body)) {
    const booking = await findNextAwaitingConfirmationByPhone(fromE164);
    if (booking) {
      await markBookingConfirmed(booking.siteId, booking.id);
      const bookingRef = `sites/${booking.siteId}/bookings/${booking.id}`;
      console.log("[whatsapp-webhook] booking updated", { bookingRef, newStatus: "confirmed" });
      const timeStr = formatTimeOnly(booking.startAt);
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
    const alreadyConfirmed = await findNextBookingByPhoneWithStatus(fromE164, "confirmed");
    if (alreadyConfirmed) {
      const reply = "התור כבר מאושר 😊";
      await sendWhatsApp({ toE164: fromE164, body: reply });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }
    console.log("[whatsapp-webhook] no booking found for YES", { fromE164 });
    const reply =
      "לא מצאתי תור שממתין לאישור עבור המספר הזה. אם קבעת תור, אפשר לפנות למספרה.";
    await sendWhatsApp({ toE164: fromE164, body: reply });
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (isNo(body)) {
    const booking = await findNextAwaitingConfirmationByPhone(fromE164);
    if (booking) {
      await markBookingCancelledByWhatsApp(booking.siteId, booking.id);
      const bookingRef = `sites/${booking.siteId}/bookings/${booking.id}`;
      console.log("[whatsapp-webhook] booking updated", { bookingRef, newStatus: "cancelled" });
      const reply = `${booking.salonName}: התור בוטל. מקווים לראותך בפעם הבאה.`;
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
    const alreadyCancelled = await findNextBookingByPhoneWithStatus(fromE164, "cancelled");
    if (alreadyCancelled) {
      const reply = "התור כבר בוטל.";
      await sendWhatsApp({ toE164: fromE164, body: reply });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }
    console.log("[whatsapp-webhook] no booking found for NO", { fromE164 });
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const help = 'כדי לאשר תור השב/השיבי "כן", כדי לבטל השב/השיבי "לא".';
  await sendWhatsApp({ toE164: fromE164, body: help });
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
