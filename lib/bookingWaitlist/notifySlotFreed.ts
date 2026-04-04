/**
 * When an appointment is cancelled/archived, offer the slot to the next matching waitlist customer (WhatsApp).
 *
 * Uses {@link sendWhatsApp} with a plain body (session-style). For customers who never messaged the business
 * number first, Meta/Twilio may require an approved *template* outside the 24h window — if sends fail in
 * production, add a dedicated template and extend the send path (same pattern as booking confirmation).
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import { waitlistEntryMatchesFreedSlot, type FreedBookingSlot } from "./matchService";

export const WAITLIST_OFFER_TTL_MS = 30 * 60 * 1000;

function formatHeDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

async function expireStaleNotifiedForPhone(
  db: Firestore,
  siteId: string,
  phoneE164: string,
  exceptId: string
): Promise<void> {
  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
  const snap = await col.where("customerPhoneE164", "==", phoneE164).where("status", "==", "notified").get();
  const batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (doc.id === exceptId) continue;
    batch.update(doc.ref, {
      status: "expired_offer",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    n++;
    if (n >= 400) break;
  }
  if (n > 0) await batch.commit();
}

export async function notifyBookingWaitlistFromFreedSlot(
  siteId: string,
  slot: FreedBookingSlot
): Promise<{ notified: boolean; entryId?: string }> {
  const db = getAdminDb();

  const siteSnap = await db.collection("sites").doc(siteId).get();
  const cfg = siteSnap.data()?.config as { salonName?: string; whatsappBrandName?: string } | undefined;
  const salonName = String(cfg?.salonName ?? cfg?.whatsappBrandName ?? "העסק").trim() || "העסק";

  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
  const activeSnap = await col.where("status", "==", "active").orderBy("createdAt", "asc").limit(40).get();

  let chosen: { id: string; data: BookingWaitlistEntry } | null = null;
  for (const doc of activeSnap.docs) {
    const data = doc.data() as BookingWaitlistEntry;
    if (waitlistEntryMatchesFreedSlot(data, slot)) {
      chosen = { id: doc.id, data };
      break;
    }
  }

  if (!chosen) {
    return { notified: false };
  }

  const now = admin.firestore.Timestamp.now();
  const expires = admin.firestore.Timestamp.fromMillis(Date.now() + WAITLIST_OFFER_TTL_MS);
  const offer: NonNullable<BookingWaitlistEntry["offer"]> = {
    dateYmd: slot.dateYmd,
    timeHHmm: slot.timeHHmm,
    workerId: slot.workerId,
    workerName: slot.workerName ?? null,
    durationMin: slot.durationMin,
    serviceName: slot.serviceName,
  };

  await col.doc(chosen.id).update({
    status: "notified",
    offer,
    offerSentAt: now,
    offerExpiresAt: expires,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await expireStaleNotifiedForPhone(db, siteId, chosen.data.customerPhoneE164, chosen.id);

  const dateLabel = formatHeDate(slot.dateYmd);
  const firstName = chosen.data.customerName.trim().split(/\s+/)[0] || "שלום";
  const body =
    `שלום ${firstName},\n\n` +
    `נפתחה הרשמה ב-${salonName}:\n` +
    `שירות: ${slot.serviceName}\n` +
    `תאריך: ${dateLabel}\n` +
    `שעה: ${slot.timeHHmm}\n\n` +
    `להזמנת התור בשעה הזו השיבו *כן*.\n` +
    `אם לא מתאים — השיבו לא.`;

  try {
    await sendWhatsApp({
      toE164: chosen.data.customerPhoneE164,
      body,
      siteId,
      meta: { automation: "booking_waitlist_slot_offer", waitlistEntryId: chosen.id },
      usageCategory: "service",
    });
  } catch (e) {
    console.error("[bookingWaitlist] send failed, reverting entry to active", e);
    await col.doc(chosen.id).update({
      status: "active",
      offer: admin.firestore.FieldValue.delete(),
      offerSentAt: admin.firestore.FieldValue.delete(),
      offerExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { notified: false };
  }

  return { notified: true, entryId: chosen.id };
}
