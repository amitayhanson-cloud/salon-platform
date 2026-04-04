/**
 * When customer replies "כן" to a waitlist slot WhatsApp, create the booking and confirm via existing WA flow.
 */

import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { onBookingCreated } from "@/lib/onBookingCreated";
import { deriveBookingStatusForWrite } from "@/lib/bookingStatusForWrite";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import { checkWorkerConflictsAdmin, parseYmdHmToDates } from "./workerConflictsAdmin";
import { getOrCreateClientAdmin } from "./clientAdmin";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsraelTime";

function offerExpired(expires: unknown): boolean {
  if (!expires || typeof (expires as { toMillis?: () => number }).toMillis !== "function") return true;
  return (expires as { toMillis: () => number }).toMillis() < Date.now();
}

export type FulfillWaitlistYesResult =
  | { ok: true; bookingId: string; confirmReply: string }
  | { ok: false; reason: string; customerReply?: string };

/** Load waitlist entry by id; return null if missing. */
export async function getWaitlistEntry(
  siteId: string,
  docId: string
): Promise<{ id: string; entry: BookingWaitlistEntry } | null> {
  const db = getAdminDb();
  const snap = await db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(docId).get();
  if (!snap.exists) return null;
  return { id: snap.id, entry: snap.data() as BookingWaitlistEntry };
}

export async function fulfillWaitlistOfferFromInboundYes(
  siteId: string,
  waitlistDocId: string
): Promise<FulfillWaitlistYesResult> {
  const loaded = await getWaitlistEntry(siteId, waitlistDocId);
  if (!loaded) {
    return { ok: false, reason: "missing_entry" };
  }
  const entry = loaded.entry;
  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(waitlistDocId);
  const offer = entry.offer;
  if (!offer || entry.status !== "notified") {
    return { ok: false, reason: "no_active_offer" };
  }
  if (offerExpired(entry.offerExpiresAt)) {
    await ref.update({
      status: "expired_offer",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      ok: false,
      reason: "offer_expired",
      customerReply: "פג תוקף ההצעה. אפשר להירשם שוב לרשימת המתנה מעמוד ההזמנה.",
    };
  }

  const workerId = offer.workerId;
  if (!workerId) {
    return { ok: false, reason: "missing_worker" };
  }

  const parsed = parseYmdHmToDates(offer.dateYmd, offer.timeHHmm, offer.durationMin);
  if (!parsed) {
    return { ok: false, reason: "bad_slot" };
  }
  const { startAt, endAt } = parsed;

  const conflict = await checkWorkerConflictsAdmin(db, siteId, workerId, offer.dateYmd, startAt, endAt, []);
  if (conflict.hasConflict) {
    await ref.update({
      status: "active",
      offer: admin.firestore.FieldValue.delete(),
      offerSentAt: admin.firestore.FieldValue.delete(),
      offerExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      ok: false,
      reason: "slot_taken",
      customerReply: "מצטעים, מישהו הספיק לקבוע את השעה הזו. נשמח אם תירשמו שוב לרשימת המתנה.",
    };
  }

  const clientId = await getOrCreateClientAdmin(
    siteId,
    entry.customerName,
    entry.customerPhoneRaw || entry.customerPhoneE164.replace(/^\+/, "")
  );

  const status = deriveBookingStatusForWrite({ status: "booked" }, "create");
  const col = db.collection("sites").doc(siteId).collection("bookings");
  const bookingPayload: Record<string, unknown> = {
    siteId,
    clientId,
    customerName: entry.customerName.trim(),
    customerPhone: entry.customerPhoneRaw?.replace(/\s|-|\(|\)/g, "") || clientId,
    customerPhoneE164: entry.customerPhoneE164,
    workerId,
    workerName: offer.workerName ?? null,
    serviceTypeId: entry.serviceTypeId ?? null,
    serviceName: entry.serviceName || offer.serviceName,
    serviceType: null,
    serviceId: entry.serviceId ?? null,
    durationMin: offer.durationMin,
    startAt: admin.firestore.Timestamp.fromDate(startAt),
    endAt: admin.firestore.Timestamp.fromDate(endAt),
    dateISO: offer.dateYmd,
    timeHHmm: (() => {
      const t = offer.timeHHmm.trim();
      return t.length >= 5 ? t.slice(0, 5) : t;
    })(),
    date: offer.dateYmd,
    time: (() => {
      const t = offer.timeHHmm.trim();
      return t.length >= 5 ? t.slice(0, 5) : t;
    })(),
    status,
    phase: 1,
    note: "הוזמן מרשימת המתנה (WhatsApp)",
    serviceColor: null,
    price: null,
    priceSource: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    waitlistEntryId: waitlistDocId,
  };

  const bookingRef = await col.add(bookingPayload);
  const bookingId = bookingRef.id;

  await ref.update({
    status: "booked",
    bookedBookingId: bookingId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    await onBookingCreated(siteId, bookingId);
  } catch (e) {
    console.error("[bookingWaitlist] onBookingCreated failed (booking still saved)", e);
  }

  const { dateStr, timeStr } = formatIsraelDateTime(startAt);
  const confirmReply =
    `מעולה — התור נקבע ל-${dateStr} בשעה ${timeStr} ל${entry.serviceName || offer.serviceName}. מצפים לראות אתכם!`;

  return { ok: true, bookingId, confirmReply };
}

/**
 * Find a notified waitlist offer for this phone (most recent). Returns siteId + doc id + entry.
 */
export async function findNotifiedWaitlistOfferForPhone(
  phoneE164: string
): Promise<{ siteId: string; id: string; entry: BookingWaitlistEntry } | null> {
  const db = getAdminDb();
  const snap = await db
    .collectionGroup("bookingWaitlistEntries")
    .where("customerPhoneE164", "==", phoneE164)
    .where("status", "==", "notified")
    .orderBy("offerSentAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  const siteId = doc.ref.parent.parent?.id;
  if (!siteId) return null;
  return { siteId, id: doc.id, entry: doc.data() as BookingWaitlistEntry };
}

export async function declineWaitlistOffer(
  siteId: string,
  docId: string
): Promise<{ reply: string }> {
  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(docId);
  await ref.update({
    status: "active",
    offer: admin.firestore.FieldValue.delete(),
    offerSentAt: admin.firestore.FieldValue.delete(),
    offerExpiresAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { reply: "קיבלנו. אם תרצו — אפשר להירשם שוב לרשימת המתנה מעמוד ההזמנה." };
}
