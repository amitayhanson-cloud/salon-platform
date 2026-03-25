/**
 * One-time (or force) merge of rows under clients/{clientId}/archivedServiceTypes
 * into dashboard analytics, without counting anything already in sites/{siteId}/bookings.
 *
 * Persisted: sites/{siteId}/analytics/deepArchiveMerge
 * - version, appliedAt, days (per YYYY-MM-DD), scan (stats)
 */

import { FieldValue, FieldPath, type Firestore } from "firebase-admin/firestore";
import { appointmentYmd, isDocCancelled } from "@/lib/cancelledBookingShared";
import { bookingDayYmdIsrael } from "@/lib/bookingDayKey";
import { countsTowardBookingAnalytics } from "@/lib/analyticsAppointmentFilters";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

export type DeepArchiveDayAdjustments = {
  bookings: number;
  bookedMinutes: number;
  revenue: number;
  trafficAttributedBookings: number;
};

const MERGE_DOC_ID = "deepArchiveMerge";

/** Matches {@link getDeterministicArchiveDocId} when serviceTypeId is missing. */
const UNKNOWN_SUFFIX = /^(.+)__unknown__(.+)$/;

function normClientKey(data: Record<string, unknown>): string {
  const cid = String(data.clientId ?? "").trim();
  const phone = String(data.customerPhone ?? data.phone ?? "").replace(/\D/g, "");
  return cid || phone || "";
}

function dedupeCompositeKey(ymd: string, data: Record<string, unknown>): string {
  const st = String(data.serviceTypeId ?? data.serviceType ?? "").trim();
  return `${ymd}|${normClientKey(data)}|${st}`;
}

function extractBookingIdFromArchiveDocId(docId: string): string | null {
  const m = docId.match(UNKNOWN_SUFFIX);
  return m && m[2] ? m[2]! : null;
}

function isRevenueEligible(data: Record<string, unknown>): boolean {
  if (isDocCancelled(data)) return false;
  const s = String((data.status as string) ?? "").trim().toLowerCase();
  return s === "completed" || s === "confirmed" || s === "active" || s === "booked";
}

function numericBookingPrice(data: Record<string, unknown>): number {
  const raw = data.price ?? data.priceApplied ?? data.finalPrice;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  return 0;
}

function durationMin(data: Record<string, unknown>): number {
  const dm = typeof data.durationMin === "number" && Number.isFinite(data.durationMin) ? data.durationMin : 60;
  return Math.max(0, dm);
}

function trafficSource(data: Record<string, unknown>): string {
  return typeof data.bookingTrafficSource === "string" ? data.bookingTrafficSource.trim().toLowerCase() : "";
}

/**
 * Loads every booking doc id and composite keys for deduplicating deep-archive rows.
 */
export async function loadBookingsDedupeSetsAdmin(
  db: Firestore,
  siteId: string
): Promise<{ allIds: Set<string>; compositeKeys: Set<string> }> {
  const allIds = new Set<string>();
  const compositeKeys = new Set<string>();
  const col = db.collection("sites").doc(siteId).collection("bookings");
  let lastId: string | undefined;

  for (;;) {
    let q = col.orderBy(FieldPath.documentId()).limit(400);
    if (lastId !== undefined) q = q.startAfter(lastId);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      allIds.add(doc.id);
      const data = doc.data() as Record<string, unknown>;
      if (isFollowUpBooking(data)) continue;
      const ymd = bookingDayYmdIsrael(data);
      if (ymd.length >= 10) compositeKeys.add(dedupeCompositeKey(ymd, data));
    }
    lastId = snap.docs[snap.docs.length - 1]!.id;
    if (snap.size < 400) break;
  }

  return { allIds, compositeKeys };
}

export type DeepArchiveScanStats = {
  archivedDocsScanned: number;
  included: number;
  skippedCancelledOrFollowUp: number;
  skippedBadDate: number;
  skippedBookingIdDup: number;
  skippedCompositeDup: number;
};

/**
 * Scans archivedServiceTypes for all clients; returns per-day adjustments that are not duplicates of main bookings.
 */
export async function scanDeepArchiveAdjustmentsAdmin(
  db: Firestore,
  siteId: string
): Promise<{ days: Record<string, DeepArchiveDayAdjustments>; stats: DeepArchiveScanStats }> {
  const { allIds, compositeKeys } = await loadBookingsDedupeSetsAdmin(db, siteId);
  const clientsSnap = await db.collection("sites").doc(siteId).collection("clients").get();

  const days: Record<string, DeepArchiveDayAdjustments> = {};
  const stats: DeepArchiveScanStats = {
    archivedDocsScanned: 0,
    included: 0,
    skippedCancelledOrFollowUp: 0,
    skippedBadDate: 0,
    skippedBookingIdDup: 0,
    skippedCompositeDup: 0,
  };

  const bump = (ymd: string, data: Record<string, unknown>) => {
    if (!days[ymd]) {
      days[ymd] = { bookings: 0, bookedMinutes: 0, revenue: 0, trafficAttributedBookings: 0 };
    }
    const b = days[ymd]!;
    const dur = durationMin(data);
    const src = trafficSource(data);
    const followUp = isFollowUpBooking(data);
    if (!followUp) b.bookings += 1;
    b.bookedMinutes += dur;
    if (isRevenueEligible(data)) b.revenue += numericBookingPrice(data);
    if (!followUp && src) b.trafficAttributedBookings += 1;
  };

  for (const c of clientsSnap.docs) {
    const archSnap = await c.ref.collection("archivedServiceTypes").get();
    for (const d of archSnap.docs) {
      stats.archivedDocsScanned++;
      const data = d.data() as Record<string, unknown>;

      if (!countsTowardBookingAnalytics(data)) {
        stats.skippedCancelledOrFollowUp++;
        continue;
      }

      const ymd = appointmentYmd(data);
      if (ymd.length < 10) {
        stats.skippedBadDate++;
        continue;
      }

      const bid = extractBookingIdFromArchiveDocId(d.id);
      if (bid && allIds.has(bid)) {
        stats.skippedBookingIdDup++;
        continue;
      }

      const ck = dedupeCompositeKey(ymd, data);
      if (compositeKeys.has(ck)) {
        stats.skippedCompositeDup++;
        continue;
      }

      stats.included++;
      bump(ymd, data);
    }
  }

  return { days, stats };
}

function mergeDocRef(db: Firestore, siteId: string) {
  return db.collection("sites").doc(siteId).collection("analytics").doc(MERGE_DOC_ID);
}

export type ApplyDeepArchiveMergeResult =
  | {
      ok: true;
      dryRun: boolean;
      stats: DeepArchiveScanStats;
      dayKeys: number;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Writes analytics/deepArchiveMerge. Does not patch monthly rollover docs (avoids double-count when
 * dashboardCurrent already folds merge into daily recomputes).
 */
export async function applyDeepArchiveMergeAdmin(
  db: Firestore,
  siteId: string,
  options?: { dryRun?: boolean; force?: boolean }
): Promise<ApplyDeepArchiveMergeResult> {
  const ref = mergeDocRef(db, siteId);
  const existing = await ref.get();
  if (existing.exists && !options?.force) {
    return { ok: false, error: "deep_archive_merge_already_applied_use_force" };
  }

  const { days, stats } = await scanDeepArchiveAdjustmentsAdmin(db, siteId);

  if (options?.dryRun) {
    return {
      ok: true,
      dryRun: true,
      stats,
      dayKeys: Object.keys(days).length,
    };
  }

  await ref.set(
    {
      version: 1,
      appliedAt: FieldValue.serverTimestamp(),
      days,
      scan: stats,
    },
    { merge: false }
  );

  return {
    ok: true,
    dryRun: false,
    stats,
    dayKeys: Object.keys(days).length,
  };
}

export async function readDeepArchiveMergeDaysAdmin(
  db: Firestore,
  siteId: string
): Promise<Record<string, DeepArchiveDayAdjustments> | null> {
  const snap = await mergeDocRef(db, siteId).get();
  if (!snap.exists) return null;
  const d = snap.data() as { days?: Record<string, DeepArchiveDayAdjustments> } | undefined;
  return d?.days ?? null;
}

export function sumDeepAdjustmentsForMonthKey(
  mergeDays: Record<string, DeepArchiveDayAdjustments> | null | undefined,
  monthKey: string
): DeepArchiveDayAdjustments {
  const z: DeepArchiveDayAdjustments = { bookings: 0, bookedMinutes: 0, revenue: 0, trafficAttributedBookings: 0 };
  if (!mergeDays) return z;
  for (const [ymd, ad] of Object.entries(mergeDays)) {
    if (ymd.startsWith(`${monthKey}-`)) {
      z.bookings += ad.bookings;
      z.bookedMinutes += ad.bookedMinutes;
      z.revenue += ad.revenue;
      z.trafficAttributedBookings += ad.trafficAttributedBookings;
    }
  }
  return z;
}

/** @internal testing */
export const __deepArchiveMergeTestOnly = {
  extractBookingIdFromArchiveDocId,
  dedupeCompositeKey,
};
