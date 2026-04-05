/**
 * When customer confirms a waitlist slot (WhatsApp yes / template button), create booking(s) and reply.
 */

import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { onBookingCreated } from "@/lib/onBookingCreated";
import { deriveBookingStatusForWrite } from "@/lib/bookingStatusForWrite";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import { checkWorkerConflictsAdmin } from "./workerConflictsAdmin";
import { getOrCreateClientAdmin } from "./clientAdmin";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsraelTime";
import { computePhases } from "@/lib/bookingPhasesTiming";
import { notifyBookingWaitlistFromFreedSlot } from "./notifySlotFreed";
import { offerSlotToFreedSlot } from "./matchService";

function offerExpired(expires: unknown): boolean {
  if (!expires || typeof (expires as { toMillis?: () => number }).toMillis !== "function") return true;
  return (expires as { toMillis: () => number }).toMillis() < Date.now();
}

function parseStartAt(dateYmd: string, timeHHmm: string): Date | null {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHHmm.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
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
    return {
      ok: false,
      reason: "missing_worker",
      customerReply:
        "לא ניתן להשלים את ההזמנה אוטומטית לשעה הזו. צרו קשר עם הסלון כדי לתאם את התור.",
    };
  }

  const startAt = parseStartAt(offer.dateYmd, offer.timeHHmm);
  if (!startAt) {
    return { ok: false, reason: "bad_slot" };
  }

  const primaryDur = Math.max(
    1,
    Math.round(Number(entry.primaryDurationMin ?? offer.primaryDurationMin ?? offer.durationMin ?? 60))
  );
  const waitMin = Math.max(0, Math.round(Number(entry.waitMinutes ?? offer.waitMinutes ?? 0)));
  const fuDur = Math.max(0, Math.round(Number(entry.followUpDurationMin ?? offer.followUpDurationMin ?? 0)));

  const phases = computePhases({
    startAt,
    durationMinutes: primaryDur,
    waitMinutes: waitMin,
    followUpDurationMinutes: fuDur,
  });

  const c1 = await checkWorkerConflictsAdmin(
    db,
    siteId,
    workerId,
    offer.dateYmd,
    phases.phase1StartAt,
    phases.phase1EndAt,
    []
  );
  if (c1.hasConflict) {
    await ref.update({
      status: "active",
      offer: admin.firestore.FieldValue.delete(),
      offerSentAt: admin.firestore.FieldValue.delete(),
      offerExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
      await notifyBookingWaitlistFromFreedSlot(siteId, offerSlotToFreedSlot(offer), {
        skipEntryIds: [waitlistDocId],
      });
    } catch (e) {
      console.error("[bookingWaitlist] cascade after primary conflict", e);
    }
    return {
      ok: false,
      reason: "slot_taken",
      customerReply: "מצטעים, מישהו הספיק לקבוע את השעה הזו. נשמח אם תירשמו שוב לרשימת המתנה.",
    };
  }

  if (fuDur > 0) {
    const fuWorker =
      offer.followUpWorkerId != null && String(offer.followUpWorkerId).trim() !== ""
        ? String(offer.followUpWorkerId).trim()
        : workerId;
    const c2 = await checkWorkerConflictsAdmin(
      db,
      siteId,
      fuWorker,
      offer.dateYmd,
      phases.phase2StartAt,
      phases.phase2EndAt,
      []
    );
    if (c2.hasConflict) {
      await ref.update({
        status: "active",
        offer: admin.firestore.FieldValue.delete(),
        offerSentAt: admin.firestore.FieldValue.delete(),
        offerExpiresAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      try {
        await notifyBookingWaitlistFromFreedSlot(siteId, offerSlotToFreedSlot(offer), {
          skipEntryIds: [waitlistDocId],
        });
      } catch (e) {
        console.error("[bookingWaitlist] cascade after follow-up conflict", e);
      }
      return {
        ok: false,
        reason: "slot_taken",
        customerReply: "מצטעים, מישהו הספיק לקבוע את השעה הזו. נשמח אם תירשמו שוב לרשימת המתנה.",
      };
    }
  }

  const clientId = await getOrCreateClientAdmin(
    siteId,
    entry.customerName,
    entry.customerPhoneRaw || entry.customerPhoneE164.replace(/^\+/, "")
  );

  const status = deriveBookingStatusForWrite({ status: "booked" }, "create");
  const col = db.collection("sites").doc(siteId).collection("bookings");
  const timeStrMain = (() => {
    const t = offer.timeHHmm.trim();
    return t.length >= 5 ? t.slice(0, 5) : t;
  })();

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
    durationMin: primaryDur,
    startAt: admin.firestore.Timestamp.fromDate(phases.phase1StartAt),
    endAt: admin.firestore.Timestamp.fromDate(phases.phase1EndAt),
    dateISO: offer.dateYmd,
    timeHHmm: timeStrMain,
    date: offer.dateYmd,
    time: timeStrMain,
    status,
    phase: 1,
    note: "הוזמן מרשימת המתנה (WhatsApp)",
    serviceColor: null,
    price: null,
    priceSource: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    waitlistEntryId: waitlistDocId,
    ...(fuDur > 0 && waitMin > 0 ? { waitMinutes: waitMin } : {}),
  };

  const bookingRef = await col.add(bookingPayload);
  const bookingId = bookingRef.id;

  if (fuDur > 0) {
    const fuWorker =
      offer.followUpWorkerId != null && String(offer.followUpWorkerId).trim() !== ""
        ? String(offer.followUpWorkerId).trim()
        : workerId;
    const fuWorkerName =
      offer.followUpWorkerName != null && String(offer.followUpWorkerName).trim() !== ""
        ? String(offer.followUpWorkerName).trim()
        : offer.workerName ?? null;
    const fuName =
      (entry.followUpServiceName != null && String(entry.followUpServiceName).trim() !== ""
        ? String(entry.followUpServiceName).trim()
        : null) ||
      (offer.followUpServiceName != null && String(offer.followUpServiceName).trim() !== ""
        ? String(offer.followUpServiceName).trim()
        : "המשך טיפול");

    const p2s = phases.phase2StartAt;
    const phase2DateStr =
      p2s.getFullYear() +
      "-" +
      String(p2s.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(p2s.getDate()).padStart(2, "0");
    const phase2TimeStr =
      String(p2s.getHours()).padStart(2, "0") + ":" + String(p2s.getMinutes()).padStart(2, "0");

    await col.add({
      siteId,
      clientId,
      customerName: entry.customerName.trim(),
      customerPhone: entry.customerPhoneRaw?.replace(/\s|-|\(|\)/g, "") || clientId,
      customerPhoneE164: entry.customerPhoneE164,
      workerId: fuWorker,
      workerName: fuWorkerName,
      serviceTypeId: null,
      serviceName: fuName,
      serviceType: null,
      serviceId: null,
      durationMin: fuDur,
      startAt: admin.firestore.Timestamp.fromDate(phases.phase2StartAt),
      endAt: admin.firestore.Timestamp.fromDate(phases.phase2EndAt),
      dateISO: phase2DateStr,
      timeHHmm: phase2TimeStr,
      date: phase2DateStr,
      time: phase2TimeStr,
      status,
      phase: 2,
      parentBookingId: bookingId,
      note: bookingPayload.note,
      serviceColor: null,
      price: null,
      priceSource: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

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

  const { dateStr, timeStr } = formatIsraelDateTime(phases.phase1StartAt);
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
  const snap = await ref.get();
  const prev = snap.exists ? (snap.data() as BookingWaitlistEntry) : null;
  const offer = prev?.offer;

  await ref.update({
    status: "active",
    offer: admin.firestore.FieldValue.delete(),
    offerSentAt: admin.firestore.FieldValue.delete(),
    offerExpiresAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (offer) {
    try {
      const slot = offerSlotToFreedSlot(offer);
      await notifyBookingWaitlistFromFreedSlot(siteId, slot, { skipEntryIds: [docId] });
    } catch (e) {
      console.error("[declineWaitlistOffer] cascade notify failed", e);
    }
  }

  return { reply: "קיבלנו. אם תרצו — אפשר להירשם שוב לרשימת המתנה מעמוד ההזמנה." };
}
