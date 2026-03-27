/**
 * POST /webhooks/twilio/whatsapp
 * Receives inbound WhatsApp messages. Validates Twilio signature, logs message,
 * and handles YES/NO confirmation flow.
 */

import { Request, Response } from "express";
import { normalizeToE164 } from "../lib/e164";
import { sendWhatsAppMessage, logInboundMessage } from "../services/whatsapp";
import {
  findNextAwaitingConfirmationByPhone,
  markBookingConfirmed,
} from "../lib/bookingConfirmation";
import { getTwilioWhatsAppFrom } from "../config";

/** Empty TwiML — we send replies via API so they are logged in whatsapp_messages */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Format time for display (e.g. "מחר ב-10:00") */
function formatAppointmentTime(d: Date): string {
  return d.toLocaleString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function handleInboundWhatsApp(
  req: Request,
  res: Response
): Promise<void> {
  const from = (req.body?.From || "").trim();
  const to = (req.body?.To || "").trim();
  const body = (req.body?.Body || "").trim();
  const messageSid = (req.body?.MessageSid || "").trim();

  if (!from || !messageSid) {
    res.status(400).send("Missing From or MessageSid");
    return;
  }

  const fromE164 = normalizeToE164(from.replace(/^whatsapp:/, ""));

  await logInboundMessage({
    fromPhone: from,
    toPhone: to,
    body,
    twilioMessageSid: messageSid,
  });

  const bodyLower = body.toLowerCase();

  if (bodyLower === "yes" || bodyLower === "כן") {
    const booking = await findNextAwaitingConfirmationByPhone(fromE164);
    if (booking) {
      await markBookingConfirmed(booking.id);
      const timeStr = formatAppointmentTime(booking.appointment_time);
      const reply = `${booking.salon_name} ✂️ תודה! ההזמנה שלך אושרה ל־${timeStr}.`;
      await sendWhatsAppMessage({
        toE164: fromE164,
        body: reply,
        bookingId: booking.id,
        salonId: booking.salon_id,
      });
      res.type("text/xml").send(EMPTY_TWIML);
      return;
    }
    const reply =
      "לא מצאנו הזמנה אחת ממתינה לאישור. Reply YES to confirm or NO to cancel.";
    await sendWhatsAppMessage({ toE164: fromE164, body: reply });
    res.type("text/xml").send(EMPTY_TWIML);
    return;
  }

  if (bodyLower === "no" || bodyLower === "לא") {
    const booking = await findNextAwaitingConfirmationByPhone(fromE164);
    if (booking) {
      const { markBookingCancelled } = await import("../lib/bookingConfirmation");
      await markBookingCancelled(booking.id);
      const reply = `${booking.salon_name}: ההזמנה בוטלה. נשמח לראותך בפעם הבאה.`;
      await sendWhatsAppMessage({
        toE164: fromE164,
        body: reply,
        bookingId: booking.id,
        salonId: booking.salon_id,
      });
      res.type("text/xml").send(EMPTY_TWIML);
      return;
    }
  }

  const help = "Reply YES to confirm your appointment or NO to cancel. ✂️";
  await sendWhatsAppMessage({ toE164: fromE164, body: help });
  res.type("text/xml").send(EMPTY_TWIML);
}
