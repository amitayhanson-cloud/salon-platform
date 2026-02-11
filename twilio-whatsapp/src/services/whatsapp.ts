/**
 * Twilio WhatsApp send helper. One sender number for the platform;
 * message body must include salon name for multi-tenant clarity.
 */

import twilio from "twilio";
import { getTwilioWhatsAppFrom, config } from "../config";
import { toWhatsAppTo } from "../lib/e164";
import { pool } from "../db";

export type SendWhatsAppParams = {
  toE164: string;
  body: string;
  bookingId?: string | null;
  salonId?: string | null;
};

/**
 * Send WhatsApp message via Twilio and log to whatsapp_messages.
 * toE164: E.164 format (e.g. +972501234567). Will be prefixed with "whatsapp:".
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppParams
): Promise<{ sid: string }> {
  const { toE164, body, bookingId = null, salonId = null } = params;
  const from = getTwilioWhatsAppFrom();
  const to = toWhatsAppTo(toE164);

  const client = twilio(config.twilio.accountSid, config.twilio.authToken);

  let sid: string;
  try {
    const message = await client.messages.create({
      body,
      from,
      to,
    });
    sid = message.sid;
    await logOutboundMessage({
      toPhone: to,
      fromPhone: from,
      body,
      bookingId,
      salonId,
      twilioMessageSid: sid,
      status: "sent",
      error: null,
    });
    return { sid };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await logOutboundMessage({
      toPhone: to,
      fromPhone: from,
      body,
      bookingId,
      salonId,
      twilioMessageSid: "",
      status: "failed",
      error,
    });
    throw e;
  }
}

async function logOutboundMessage(params: {
  toPhone: string;
  fromPhone: string;
  body: string;
  bookingId: string | null;
  salonId: string | null;
  twilioMessageSid: string;
  status: string;
  error: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO whatsapp_messages (
      direction, to_phone, from_phone, body, booking_id, salon_id,
      twilio_message_sid, status, error
    ) VALUES ('outbound', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.toPhone,
      params.fromPhone,
      params.body,
      params.bookingId || null,
      params.salonId || null,
      params.twilioMessageSid,
      params.status,
      params.error,
    ]
  );
}

/**
 * Log an inbound message (called from webhook).
 */
export async function logInboundMessage(params: {
  fromPhone: string;
  toPhone: string;
  body: string;
  twilioMessageSid: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO whatsapp_messages (
      direction, to_phone, from_phone, body, twilio_message_sid, status
    ) VALUES ('inbound', $1, $2, $3, $4, 'received')`,
    [
      params.toPhone,
      params.fromPhone,
      params.body,
      params.twilioMessageSid,
    ]
  );
}
