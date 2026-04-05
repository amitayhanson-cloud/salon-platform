/**
 * Time-aware waitlist matching: site TZ buckets, slot lock, WhatsApp template (Content v2 env),
 * status `pending_offer` (legacy reads still accept `notified`).
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import {
  waitlistEntryMatchesFreedSlot,
  explainWaitlistEntryMismatch,
  waitlistWorkerPreferenceRank,
  type FreedBookingSlot,
  freedSlotToOfferSlot,
} from "./matchService";
import { WAITLIST_PENDING_OFFER_STATUSES, WAITLIST_WAITING_STATUSES } from "./waitlistStatus";
import { getTimePreferenceBucketForSlot } from "./timeBuckets";
import {
  tryAcquireWaitlistSlotOffer,
  waitlistSlotLockDocId,
  rollbackWaitlistOfferAcquire,
} from "./slotLock";

/** Offer validity (matches slot lock window). */
export const WAITLIST_OFFER_TTL_MS = 20 * 60 * 1000;
export const WAITLIST_SLOT_LOCK_MS = 20 * 60 * 1000;

export type TriggerWaitlistMatchOptions = {
  skipEntryIds?: string[];
  matchAnyService?: boolean;
  bypassLock?: boolean;
};

function getSiteIanaTimezone(siteData: Record<string, unknown> | undefined): string {
  const cfg = siteData?.config as
    | { archiveRetention?: { timezone?: string }; timezone?: string }
    | undefined;
  const z =
    (cfg?.archiveRetention?.timezone && String(cfg.archiveRetention.timezone).trim()) ||
    (cfg?.timezone && String(cfg.timezone).trim()) ||
    "";
  return z || "Asia/Jerusalem";
}

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

function revertWaitingStatusFromEntry(entry: BookingWaitlistEntry): "waiting" | "active" {
  return entry.status === "notified" || entry.status === "active" ? "active" : "waiting";
}

async function expireStalePendingOffersForPhone(
  db: Firestore,
  siteId: string,
  phoneE164: string,
  exceptId: string
): Promise<void> {
  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
  for (const st of WAITLIST_PENDING_OFFER_STATUSES) {
    const snap = await col.where("customerPhoneE164", "==", phoneE164).where("status", "==", st).limit(80).get();
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
}

/**
 * Next matching waitlist row for this freed slot; sends WhatsApp and sets `pending_offer`.
 * @param siteId Tenant / site id.
 * @param slot Calendar window (primary + optional follow-up) the matcher uses for service and duration fit.
 */
export async function triggerWaitlistMatchForFreedSlot(
  siteId: string,
  slot: FreedBookingSlot,
  options?: TriggerWaitlistMatchOptions
): Promise<{ notified: boolean; entryId?: string; reason?: string }> {
  const db = getAdminDb();
  const skip = new Set((options?.skipEntryIds ?? []).filter(Boolean));
  const matchAnyService = options?.matchAnyService === true;
  const bypassLock = options?.bypassLock === true;

  const siteSnap = await db.collection("sites").doc(siteId).get();
  const siteData = siteSnap.data() as Record<string, unknown> | undefined;
  const siteTz = getSiteIanaTimezone(siteData);
  const cfg = siteData?.config as { salonName?: string; whatsappBrandName?: string } | undefined;
  const salonName = String(cfg?.salonName ?? cfg?.whatsappBrandName ?? "העסק").trim() || "העסק";

  const bucket = getTimePreferenceBucketForSlot(slot.dateYmd, slot.timeHHmm, siteTz);
  const lockId = waitlistSlotLockDocId(slot.dateYmd, slot.timeHHmm, slot.workerId);

  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");

  let activeSnap;
  try {
    activeSnap = await col
      .where("status", "in", [...WAITLIST_WAITING_STATUSES])
      .where("preferredDateYmd", "==", slot.dateYmd)
      .limit(120)
      .get();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bookingWaitlist] waitlist_query_failed", { siteId, dateYmd: slot.dateYmd, error: msg });
    throw e;
  }

  const sortedDocs = [...activeSnap.docs].sort((a, b) => {
    const da = a.data() as BookingWaitlistEntry;
    const dbEntry = b.data() as BookingWaitlistEntry;
    const wa = waitlistWorkerPreferenceRank(da, slot);
    const wb = waitlistWorkerPreferenceRank(dbEntry, slot);
    if (wa !== wb) return wa - wb;
    const ta = firestoreTsMs(a.data().createdAt);
    const tb = firestoreTsMs(b.data().createdAt);
    if (ta !== tb) return ta - tb;
    const qa = typeof da.queuePositionForDay === "number" ? da.queuePositionForDay : 1e9;
    const qb = typeof dbEntry.queuePositionForDay === "number" ? dbEntry.queuePositionForDay : 1e9;
    if (qa !== qb) return qa - qb;
    return a.id.localeCompare(b.id);
  });

  const matchOpts = { matchAnyService, timeBucket: bucket };
  let chosen: { id: string; data: BookingWaitlistEntry } | null = null;
  const acquireSkips: Array<{ entryId: string; reason: string }> = [];
  let firstFilterRejectExplain: string | null = null;

  for (const doc of sortedDocs) {
    if (skip.has(doc.id)) continue;
    const data = doc.data() as BookingWaitlistEntry;
    if (!waitlistEntryMatchesFreedSlot(data, slot, matchOpts)) {
      if (firstFilterRejectExplain === null) {
        firstFilterRejectExplain = explainWaitlistEntryMismatch(data, slot, matchOpts);
      }
      continue;
    }
    const acq = await tryAcquireWaitlistSlotOffer(db, siteId, lockId, {
      lockDurationMs: WAITLIST_SLOT_LOCK_MS,
      customerPhoneE164: data.customerPhoneE164,
      entryId: doc.id,
      bypassLock,
    });
    if (!acq.ok) {
      if (acq.reason === "locked") {
        return { notified: false, reason: "slot_locked" };
      }
      acquireSkips.push({ entryId: doc.id, reason: acq.reason });
      continue;
    }
    chosen = { id: doc.id, data };
    break;
  }

  if (!chosen) {
    const first = sortedDocs[0];
    console.log("[bookingWaitlist] no_matching_waitlist_entry", {
      siteId,
      dateYmd: slot.dateYmd,
      timeHHmm: slot.timeHHmm,
      workerId: slot.workerId,
      activeForDay: sortedDocs.length,
      freedService: slot.serviceName,
      bucket,
      siteTz,
      matchAnyService,
      firstQueueEntryId: first?.id ?? null,
      firstFilterReject: firstFilterRejectExplain ?? undefined,
      slotPrimaryMin: slot.primaryDurationMin,
      slotWaitMin: slot.waitMinutes,
      slotFollowUpMin: slot.followUpDurationMin,
      acquireSkips: acquireSkips.length ? acquireSkips : undefined,
    });
    return { notified: false, reason: "no_match" };
  }

  const now = admin.firestore.Timestamp.now();
  const expires = admin.firestore.Timestamp.fromMillis(Date.now() + WAITLIST_OFFER_TTL_MS);
  const offer = freedSlotToOfferSlot(slot);

  await col.doc(chosen.id).update({
    status: "pending_offer",
    offer,
    offerSentAt: now,
    offerExpiresAt: expires,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await expireStalePendingOffersForPhone(db, siteId, chosen.data.customerPhoneE164, chosen.id);

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
    console.error("[bookingWaitlist] send failed, reverting entry", e);
    await rollbackWaitlistOfferAcquire(db, siteId, lockId, chosen.data.customerPhoneE164, chosen.id);
    const back = revertWaitingStatusFromEntry(chosen.data);
    await col.doc(chosen.id).update({
      status: back,
      offer: admin.firestore.FieldValue.delete(),
      offerSentAt: admin.firestore.FieldValue.delete(),
      offerExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { notified: false, reason: "send_failed" };
  }

  console.log("[bookingWaitlist] slot_offer_sent", {
    siteId,
    waitlistEntryId: chosen.id,
    dateYmd: slot.dateYmd,
    timeHHmm: slot.timeHHmm,
  });

  return { notified: true, entryId: chosen.id };
}

/**
 * Spec-style entry point: `date` and `startTime` must match `slot.dateYmd` / `slot.timeHHmm`.
 */
export async function triggerWaitlistMatch(
  tenantId: string,
  date: string,
  startTime: string,
  slot: FreedBookingSlot,
  options?: TriggerWaitlistMatchOptions
): Promise<{ notified: boolean; entryId?: string; reason?: string }> {
  const t = startTime.trim().length >= 5 ? startTime.trim().slice(0, 5) : startTime.trim();
  if (slot.dateYmd !== date || slot.timeHHmm.slice(0, 5) !== t) {
    console.warn("[triggerWaitlistMatch] slot date/time mismatch params", {
      tenantId,
      date,
      startTime: t,
      slotDate: slot.dateYmd,
      slotTime: slot.timeHHmm,
    });
  }
  return triggerWaitlistMatchForFreedSlot(tenantId, slot, options);
}
