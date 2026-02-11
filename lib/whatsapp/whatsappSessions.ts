/**
 * WhatsApp selection sessions: whatsapp_sessions/{phoneE164}.
 * When multiple bookings match YES/NO, we save choices and wait for "1"/"2"/...
 */

import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { BookingChoice } from "./findBookingsAwaitingConfirmation";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

export type SessionIntent = "confirm" | "cancel";

export type WhatsAppSession = {
  phoneE164: string;
  status: "awaiting_selection";
  intent: SessionIntent;
  createdAt: admin.firestore.FieldValue;
  expiresAt: Timestamp;
  choices: Array<{
    bookingRef: string;
    siteId: string;
    bookingId: string;
    startAt: Timestamp;
    siteName: string;
    serviceName?: string;
  }>;
  lastInboundMessageSid?: string;
  lastInboundBody?: string;
};

const SESSION_TTL_MINUTES = 10;

export async function createWhatsAppSession(params: {
  phoneE164: string;
  intent: SessionIntent;
  choices: BookingChoice[];
  lastInboundMessageSid?: string;
  lastInboundBody?: string;
}): Promise<void> {
  const db = getAdminDb();
  const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
  const doc: Omit<WhatsAppSession, "createdAt"> & { createdAt: admin.firestore.FieldValue } = {
    phoneE164: params.phoneE164,
    status: "awaiting_selection",
    intent: params.intent,
    createdAt: serverTimestamp(),
    expiresAt,
    choices: params.choices.map((c) => ({
      bookingRef: c.bookingRef,
      siteId: c.siteId,
      bookingId: c.bookingId,
      startAt: c.startAt,
      siteName: c.siteName,
      serviceName: c.serviceName,
    })),
    ...(params.lastInboundMessageSid != null && { lastInboundMessageSid: params.lastInboundMessageSid }),
    ...(params.lastInboundBody != null && { lastInboundBody: params.lastInboundBody }),
  };
  await db.collection("whatsapp_sessions").doc(params.phoneE164).set(doc);
}

export async function getWhatsAppSession(
  phoneE164: string
): Promise<(WhatsAppSession & { createdAt: Timestamp }) | null> {
  const db = getAdminDb();
  const snap = await db.collection("whatsapp_sessions").doc(phoneE164).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt : Timestamp.fromMillis(0);
  if (expiresAt.toMillis() < Date.now()) return null;
  return {
    phoneE164: data.phoneE164,
    status: data.status,
    intent: data.intent,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    expiresAt,
    choices: data.choices ?? [],
    lastInboundMessageSid: data.lastInboundMessageSid,
    lastInboundBody: data.lastInboundBody,
  } as WhatsAppSession & { createdAt: Timestamp };
}

export async function deleteWhatsAppSession(phoneE164: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_sessions").doc(phoneE164).delete();
}
