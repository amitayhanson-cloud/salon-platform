/**
 * When an appointment is cancelled/archived, offer the slot to the next matching waitlist customer (WhatsApp template).
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import {
  waitlistEntryMatchesFreedSlot,
  type FreedBookingSlot,
  freedSlotToOfferSlot,
} from "./matchService";

export const WAITLIST_OFFER_TTL_MS = 30 * 60 * 1000;

export type NotifyWaitlistOptions = {
  /** Do not offer these entries in this pass (e.g. customer just declined). */
  skipEntryIds?: string[];
};

function formatHeDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function firestoreTsMs(ts: unknown): number {
  if (ts != null && typeof (ts as { toMillis?: () => number }).toMillis === "function") {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Number.MAX_SAFE_INTEGER;
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
  slot: FreedBookingSlot,
  options?: NotifyWaitlistOptions
): Promise<{ notified: boolean; entryId?: string }> {
  const db = getAdminDb();
  const skip = new Set((options?.skipEntryIds ?? []).filter(Boolean));

  const siteSnap = await db.collection("sites").doc(siteId).get();
  const cfg = siteSnap.data()?.config as { salonName?: string; whatsappBrandName?: string } | undefined;
  const salonName = String(cfg?.salonName ?? cfg?.whatsappBrandName ?? "העסק").trim() || "העסק";

  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");

  let activeSnap;
  try {
    /** No orderBy: avoids composite-index issues and includes docs missing `createdAt` (sorted in memory). */
    activeSnap = await col
      .where("status", "==", "active")
      .where("preferredDateYmd", "==", slot.dateYmd)
      .limit(120)
      .get();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bookingWaitlist] waitlist_query_failed", { siteId, dateYmd: slot.dateYmd, error: msg });
    throw e;
  }

  const sortedDocs = [...activeSnap.docs].sort((a, b) => {
    const ta = firestoreTsMs(a.data().createdAt);
    const tb = firestoreTsMs(b.data().createdAt);
    if (ta !== tb) return ta - tb;
    const da = a.data() as BookingWaitlistEntry;
    const dbEntry = b.data() as BookingWaitlistEntry;
    const qa = typeof da.queuePositionForDay === "number" ? da.queuePositionForDay : 1e9;
    const qb = typeof dbEntry.queuePositionForDay === "number" ? dbEntry.queuePositionForDay : 1e9;
    if (qa !== qb) return qa - qb;
    return a.id.localeCompare(b.id);
  });

  let chosen: { id: string; data: BookingWaitlistEntry } | null = null;
  for (const doc of sortedDocs) {
    if (skip.has(doc.id)) continue;
    const data = doc.data() as BookingWaitlistEntry;
    if (waitlistEntryMatchesFreedSlot(data, slot)) {
      chosen = { id: doc.id, data };
      break;
    }
  }

  if (!chosen) {
    console.log("[bookingWaitlist] no_matching_waitlist_entry", {
      siteId,
      dateYmd: slot.dateYmd,
      timeHHmm: slot.timeHHmm,
      activeForDay: sortedDocs.length,
      freedService: slot.serviceName,
      freedServiceTypeId: slot.serviceTypeId,
    });
    return { notified: false };
  }

  const now = admin.firestore.Timestamp.now();
  const expires = admin.firestore.Timestamp.fromMillis(Date.now() + WAITLIST_OFFER_TTL_MS);
  const offer = freedSlotToOfferSlot(slot);

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
  const timeDisp = (() => {
    const t = slot.timeHHmm.trim();
    return t.length >= 5 ? t.slice(0, 5) : t;
  })();

  const logBody =
    `שלום ${firstName}! התפנה תור ל${salonName} בתאריך ${dateLabel} בשעה ${timeDisp}. האם תרצו לשריין אותו?`;

  try {
    await sendWhatsApp({
      toE164: chosen.data.customerPhoneE164,
      body: logBody,
      siteId,
      template: {
        name: "booking_waitlist_slot_offer",
        language: "he",
        variables: {
          "1": firstName,
          "2": salonName,
          "3": dateLabel,
          "4": timeDisp,
        },
      },
      meta: {
        automation: "booking_waitlist_slot_offer",
        waitlistEntryId: chosen.id,
        templateName: "booking_waitlist_slot_offer",
      },
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

  console.log("[bookingWaitlist] slot_offer_sent", {
    siteId,
    waitlistEntryId: chosen.id,
    dateYmd: slot.dateYmd,
    timeHHmm: slot.timeHHmm,
  });

  return { notified: true, entryId: chosen.id };
}
