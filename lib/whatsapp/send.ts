/**
 * Twilio WhatsApp send helper. One sender number for the platform.
 * Logs every outbound message to Firestore whatsapp_messages.
 * Server-only: uses Firebase Admin and Twilio env vars.
 */

import twilio from "twilio";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { toWhatsAppTo } from "./e164";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromRaw = process.env.TWILIO_WHATSAPP_FROM?.trim() || "";

function getFrom(): string {
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  }
  if (!fromRaw) throw new Error("TWILIO_WHATSAPP_FROM is required (e.g. whatsapp:+14155238886)");
  return fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`;
}

export type SendWhatsAppParams = {
  toE164: string;
  body: string;
  /** Site/salon id (sites/{siteId}/...) */
  siteId?: string | null;
  /** Booking doc id */
  bookingId?: string | null;
  /** Full path for logging, e.g. sites/{siteId}/bookings/{bookingId} */
  bookingRef?: string | null;
  /** @deprecated Use siteId */
  salonId?: string | null;
  /** Optional metadata stored in whatsapp_messages (e.g. reminder_sent_immediately_due_to_last_minute_booking) */
  meta?: Record<string, unknown> | null;
};

/**
 * Send WhatsApp message via Twilio and log to Firestore whatsapp_messages.
 * Returns Twilio message SID.
 */
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<{ sid: string }> {
  const {
    toE164,
    body,
    siteId: siteIdParam = null,
    bookingId = null,
    bookingRef = null,
    salonId: salonIdParam = null,
    meta = null,
  } = params;
  const siteId = siteIdParam ?? salonIdParam;
  const from = getFrom();
  const to = toWhatsAppTo(toE164);

  const client = twilio(accountSid!, authToken!);
  let sid: string;
  let status: "sent" | "failed" = "sent";
  let error: string | null = null;

  try {
    const message = await client.messages.create({ body, from, to });
    sid = message.sid;
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
    sid = "";
    await logOutbound({
      toPhone: to,
      fromPhone: from,
      body,
      siteId,
      bookingId,
      bookingRef,
      twilioMessageSid: null,
      status,
      error,
      meta,
    });
    throw e;
  }

  await logOutbound({
    toPhone: to,
    fromPhone: from,
    body,
    siteId,
    bookingId,
    bookingRef,
    twilioMessageSid: sid,
    status,
    error: null,
    meta,
  });
  return { sid };
}

async function logOutbound(params: {
  toPhone: string;
  fromPhone: string;
  body: string;
  siteId: string | null;
  bookingId: string | null;
  bookingRef: string | null;
  twilioMessageSid: string | null;
  status: "sent" | "failed";
  error: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getAdminDb();
  const doc: Record<string, unknown> = {
    direction: "outbound",
    toPhone: params.toPhone,
    fromPhone: params.fromPhone,
    body: params.body,
    siteId: params.siteId ?? null,
    bookingId: params.bookingId ?? null,
    bookingRef: params.bookingRef ?? null,
    twilioMessageSid: params.twilioMessageSid ?? null,
    createdAt: Timestamp.now(),
    error: params.error ?? null,
  };
  if (params.meta && typeof params.meta === "object") {
    Object.assign(doc, params.meta);
  }
  await db.collection("whatsapp_messages").add(doc);
}

/**
 * Log an inbound message (called from webhook).
 */
export async function logInboundWhatsApp(params: {
  fromPhone: string;
  toPhone: string;
  body: string;
  twilioMessageSid: string;
}): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_messages").add({
    direction: "inbound",
    toPhone: params.toPhone,
    fromPhone: params.fromPhone,
    body: params.body,
    bookingId: null,
    salonId: null,
    twilioMessageSid: params.twilioMessageSid,
    createdAt: Timestamp.now(),
    error: null,
  });
}

/**
 * Log ambiguous YES/NO when multiple bookings await confirmation for this phone.
 */
export async function logAmbiguousWhatsApp(params: {
  fromPhone: string;
  toPhone: string;
  body: string;
  twilioMessageSid: string;
  bookingRefs: string[];
}): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_messages").add({
    direction: "inbound",
    status: "ambiguous",
    fromPhone: params.fromPhone,
    toPhone: params.toPhone,
    body: params.body,
    twilioMessageSid: params.twilioMessageSid,
    bookingRefs: params.bookingRefs,
    createdAt: Timestamp.now(),
  });
}
