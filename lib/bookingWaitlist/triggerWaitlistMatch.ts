/**
 * Time-aware waitlist matching: site TZ buckets, slot lock, WhatsApp template (Content v2 env),
 * status `pending_offer` (legacy reads still accept `notified`).
 * Greedy multi-offer: packs several waitlist customers into one cancellation when wall time allows.
 */

import { randomBytes } from "node:crypto";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import admin from "firebase-admin";
import type { CollectionReference, Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import type { TimePreferenceValue } from "@/types/timePreference";
import {
  waitlistEntryMatchesFreedSlot,
  explainWaitlistEntryMismatch,
  waitlistWorkerPreferenceRank,
  expandFreedSlotToMatchSlices,
  buildAtomicWallSegments,
  applyWallOccupanciesToAtomicSegments,
  wallOccupanciesFromEntryAndCapacity,
  waitlistOfferFromEntryAgainstCapacity,
  sortFreedSlotsByWallTime,
  segmentDurationMin,
  mergeBusyIntervalsMs,
  subtractOpenIntervalFromBusyIntervals,
  mergedBusyOverlapsOpenInterval,
  cancellationInterPhaseWaitTunnelUtcMs,
  cancellationFollowUpHandsWindowUtcMs,
  waitlistEntryHandsPhasesVsBusy,
  findContiguousGapContainingWindow,
  intersectUtcGapWithSalonDayHours,
  siteDayWallBoundsUtcMs,
  cancellationFootprintWindowUtcMs,
  buildMaxFreedSlotFromHorizonGap,
  collectBucketsAlongWallIntervalMs,
  type FreedBookingSlot,
  type FreedSlotMatchProbe,
  type BusyIntervalMs,
  type WaitlistSlotMatchOptions,
  trySlideWaitlistCapacitySliceForStrictTime,
} from "./matchService";
import { fetchBookingSettingsAdmin } from "./bookingSettingsAdmin";
import { getJsDow, getDayConfig } from "@/lib/scheduleDayMapping";
import type { BookingSettings, DayHours } from "@/types/bookingSettings";
import {
  fetchSiteDayBookingDocsAdmin,
  mergeBusyWithSalonBreaks,
  workerPhaseBusyIntervalsUtcMsForDay,
} from "./adminWorkerDayBusy";
import { WAITLIST_PENDING_OFFER_STATUSES, WAITLIST_WAITING_STATUSES } from "./waitlistStatus";
import { getTimePreferenceBucketForSlot } from "./timeBuckets";
import {
  tryAcquireWaitlistSlotOffer,
  waitlistSlotLockDocId,
  rollbackWaitlistOfferAcquire,
} from "./slotLock";
import { WAITLIST_OFFER_TTL_MS, WAITLIST_SLOT_LOCK_MS } from "./waitlistOfferConstants";

export { WAITLIST_OFFER_TTL_MS, WAITLIST_SLOT_LOCK_MS } from "./waitlistOfferConstants";

/**
 * TEMP: verbose Firestore + filter tracing for `no_matching_waitlist_entry`.
 * Flip to false (or remove block) after debugging.
 */
const TEMP_DEBUG_WAITLIST_MATCH = true;

/** Segments shorter than this (after packing) are not offered again in this run. */
const MIN_PACK_SEGMENT_MIN = 15;

const MAX_PACK_OFFERS_PER_RUN = 32;

export type TriggerWaitlistMatchOptions = {
  skipEntryIds?: string[];
  matchAnyService?: boolean;
  bypassLock?: boolean;
  /** When true, only the passed-in freed footprint is used (no schedule horizon scan). */
  skipHorizonScan?: boolean;
};

export type TriggerWaitlistMatchResult = {
  notified: boolean;
  /** First notified entry (backward compatible). */
  entryId?: string;
  /** All entries notified in this run (multi-pack). */
  entryIds?: string[];
  reason?: string;
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

/** TEMP: one line per person when match filter or acquire fails (see TEMP_DEBUG_WAITLIST_MATCH). */
function logDebugWaitlistPerPersonReject(args: {
  customerName: string;
  docId: string;
  entryStatus: string;
  kind: "filter" | "acquire";
  entry: BookingWaitlistEntry;
  slice: FreedBookingSlot;
  matchOpts?: WaitlistSlotMatchOptions;
  slotBucket: ReturnType<typeof getTimePreferenceBucketForSlot>;
  acquireReason?: string;
}): void {
  if (!TEMP_DEBUG_WAITLIST_MATCH) return;
  const displayName = args.customerName.trim() || args.docId;
  if (args.kind === "acquire") {
    console.log(
      `[bookingWaitlist] DEBUG manual_filter User [${displayName}] rejected because: offer acquire failed [${args.acquireReason ?? "unknown"}]`
    );
    return;
  }
  const waitingList = [...WAITLIST_WAITING_STATUSES].join(", ");
  const parts: string[] = [];
  if (!(WAITLIST_WAITING_STATUSES as readonly string[]).includes(args.entryStatus)) {
    parts.push(`Status is [${args.entryStatus}], expected [${waitingList}]`);
  }
  const expl = explainWaitlistEntryMismatch(args.entry, args.slice, args.matchOpts);
  if (expl.startsWith("time_bucket")) {
    parts.push(
      `Bucket Mismatch (UserBucket ${JSON.stringify(args.entry.timePreference ?? null)} vs SlotBucket [${String(args.slotBucket)}])`
    );
  }
  if (expl.startsWith("horizon_buckets")) {
    const hb = args.matchOpts?.horizonBuckets;
    parts.push(
      `Horizon bucket mismatch (user ${JSON.stringify(args.entry.timePreference ?? null)} vs allowed [${hb ? [...hb].sort().join(", ") : ""}])`
    );
  }
  if (expl.startsWith("strict_offer_time")) {
    parts.push(`Offer time / hours: ${expl.slice("strict_offer_time ".length)}`);
  }
  if (expl.startsWith("date_mismatch")) {
    parts.push(
      `Date mismatch (entry preferredDateYmd [${args.entry.preferredDateYmd ?? ""}] vs slot [${args.slice.dateYmd}])`
    );
  }
  if (expl.startsWith("service_mismatch")) {
    parts.push(`Service mismatch: ${expl.slice("service_mismatch ".length)}`);
  }
  if (expl.startsWith("duration_or_phases")) {
    parts.push(`Duration / phases: ${expl.slice("duration_or_phases ".length)}`);
  }
  if (parts.length === 0 && expl !== "ok") {
    parts.push(expl);
  }
  if (parts.length === 0) {
    parts.push("no explain reason (unexpected: match false but explain ok)");
  }
  console.log(
    `[bookingWaitlist] DEBUG manual_filter User [${displayName}] rejected because: ${parts.join("; ")}`
  );
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

async function resolveHorizonRootSlot(
  db: Firestore,
  siteId: string,
  slot: FreedBookingSlot,
  siteTz: string,
  skipHorizon: boolean,
  salonDayForClip: Pick<DayHours, "enabled" | "start" | "end" | "breaks"> | null,
  dayDocsCache: Map<string, Array<{ id: string; data: Record<string, unknown> }>>
): Promise<{
  rootSlot: FreedBookingSlot;
  horizonBuckets: ReadonlySet<Exclude<TimePreferenceValue, "anytime">> | null;
}> {
  if (skipHorizon || !slot.workerId?.trim()) {
    return { rootSlot: slot, horizonBuckets: null };
  }
  try {
    let dayDocs = dayDocsCache.get(slot.dateYmd);
    if (!dayDocs) {
      dayDocs = await fetchSiteDayBookingDocsAdmin(db, siteId, slot.dateYmd);
      dayDocsCache.set(slot.dateYmd, dayDocs);
    }
    const wid = slot.workerId.trim();
    const busyPhase = workerPhaseBusyIntervalsUtcMsForDay(dayDocs, wid, slot.dateYmd, siteTz);
    const busyRaw = mergeBusyWithSalonBreaks(
      busyPhase,
      slot.dateYmd,
      siteTz,
      salonDayForClip ?? {}
    );
    const dayBounds = siteDayWallBoundsUtcMs(slot.dateYmd, siteTz);
    const window = cancellationFootprintWindowUtcMs(slot, siteTz);
    if (!dayBounds || !window) {
      return { rootSlot: slot, horizonBuckets: null };
    }

    const sfSlot = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));
    if (sfSlot > 0) {
      const pWid = slot.workerId?.trim() || "";
      const fuWid =
        slot.followUpWorkerId != null && String(slot.followUpWorkerId).trim() !== ""
          ? String(slot.followUpWorkerId).trim()
          : pWid;
      if (fuWid && fuWid !== pWid) {
        const fuBusyPhase = workerPhaseBusyIntervalsUtcMsForDay(dayDocs, fuWid, slot.dateYmd, siteTz);
        const fuBusyRaw = mergeBusyWithSalonBreaks(
          fuBusyPhase,
          slot.dateYmd,
          siteTz,
          salonDayForClip ?? {}
        );
        const fuBusy = fuBusyRaw;
        const fuWin = cancellationFollowUpHandsWindowUtcMs(slot, siteTz);
        if (fuWin && mergedBusyOverlapsOpenInterval(fuBusy, fuWin.startMs, fuWin.endExclusiveMs)) {
          return { rootSlot: slot, horizonBuckets: null };
        }
      }
    }

    const merged = mergeBusyIntervalsMs(busyRaw);
    const waitTunnel = cancellationInterPhaseWaitTunnelUtcMs(slot, siteTz);
    const busyForGap = waitTunnel
      ? subtractOpenIntervalFromBusyIntervals(
          merged,
          waitTunnel.startMs,
          waitTunnel.endExclusiveMs
        )
      : merged;

    let gap = findContiguousGapContainingWindow(
      busyForGap,
      window,
      dayBounds.dayStartMs,
      dayBounds.dayEndExclusiveMs
    );
    if (!gap) {
      return { rootSlot: slot, horizonBuckets: null };
    }
    if (salonDayForClip) {
      const clipped = intersectUtcGapWithSalonDayHours(
        gap.gapStartMs,
        gap.gapEndExclusiveMs,
        slot.dateYmd,
        siteTz,
        salonDayForClip
      );
      if (!clipped) {
        return { rootSlot: slot, horizonBuckets: null };
      }
      const c0 = window.startMs;
      const c1 = window.endMsExclusive;
      if (c0 < clipped.gapStartMs || c1 > clipped.gapEndExclusiveMs) {
        return { rootSlot: slot, horizonBuckets: null };
      }
      gap = clipped;
    }
    const startYmd = formatInTimeZone(gap.gapStartMs, siteTz, "yyyy-MM-dd");
    const endYmd = formatInTimeZone(gap.gapEndExclusiveMs - 1, siteTz, "yyyy-MM-dd");
    if (startYmd !== slot.dateYmd || endYmd !== slot.dateYmd) {
      return { rootSlot: slot, horizonBuckets: null };
    }
    const maxSlot = buildMaxFreedSlotFromHorizonGap(gap, siteTz, slot);
    if (!maxSlot) {
      return { rootSlot: slot, horizonBuckets: null };
    }
    const aligned: FreedBookingSlot = { ...maxSlot, dateYmd: slot.dateYmd };
    const cancelMin = Math.round((window.endMsExclusive - window.startMs) / 60_000);
    const gapMin = Math.round((gap.gapEndExclusiveMs - gap.gapStartMs) / 60_000);
    console.log(
      `[bookingWaitlist] Scanned Horizon: Cancellation was ${cancelMin}m, but found a total contiguous gap of ${gapMin}m. Testing waitlist matches...`,
      { siteId, workerId: slot.workerId, dateYmd: slot.dateYmd }
    );
    const buckets = new Set(
      collectBucketsAlongWallIntervalMs(gap.gapStartMs, gap.gapEndExclusiveMs, siteTz)
    );
    return { rootSlot: aligned, horizonBuckets: buckets };
  } catch (e) {
    console.warn("[bookingWaitlist] horizon_scan_failed", {
      siteId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { rootSlot: slot, horizonBuckets: null };
  }
}

type SliceAttemptLog = {
  matchProbe: string;
  dateYmd: string;
  timeHHmm: string;
  workerId: string | null;
  bucket: ReturnType<typeof getTimePreferenceBucketForSlot>;
  horizonBuckets?: Exclude<TimePreferenceValue, "anytime">[];
  activeForDay: number;
  firstQueueEntryId: string | null;
  firstFilterReject?: string;
  slotLocked?: boolean;
  acquireSkips?: Array<{ entryId: string; reason: string }>;
};

type FindMatchFromProbesResult =
  | {
      ok: true;
      docId: string;
      data: BookingWaitlistEntry;
      capacitySlice: FreedBookingSlot;
      matchProbe: string;
      lockId: string;
    }
  | { ok: false; sliceAttempts: SliceAttemptLog[]; probesTried: string[]; anySlotLocked: boolean };

async function findFirstMatchFromProbes(
  db: Firestore,
  siteId: string,
  col: CollectionReference,
  siteTz: string,
  skipLocal: Set<string>,
  skipPhones: Set<string>,
  matchAnyService: boolean,
  bypassLock: boolean,
  probes: FreedSlotMatchProbe[],
  horizonBucketsEffective: ReadonlySet<Exclude<TimePreferenceValue, "anytime">> | null,
  strictOfferWall: NonNullable<WaitlistSlotMatchOptions["strictOfferWall"]>,
  bookingSettings: BookingSettings,
  dayDocsCache: Map<string, Array<{ id: string; data: Record<string, unknown> }>>
): Promise<FindMatchFromProbesResult> {
  const sliceAttempts: SliceAttemptLog[] = [];
  const probesTried = probes.map((p) => p.label);
  let anySlotLocked = false;
  const rawCountByYmd = new Map<string, number>();
  const mergedBusyCache = new Map<string, BusyIntervalMs[]>();
  const dayHoursByYmd = new Map<string, DayHours>();

  function salonDayForBookingDate(dateYmd: string): DayHours {
    const cached = dayHoursByYmd.get(dateYmd);
    if (cached) return cached;
    const ref = fromZonedTime(`${dateYmd}T12:00:00`, siteTz);
    const jsD = getJsDow(ref, siteTz);
    const base = getDayConfig(bookingSettings, jsD) ?? { enabled: true, start: "09:00", end: "18:00" };
    const key = String(jsD) as keyof BookingSettings["days"];
    const raw = bookingSettings.days?.[key];
    const next: DayHours = { ...base, breaks: raw?.breaks };
    dayHoursByYmd.set(dateYmd, next);
    return next;
  }

  async function getMergedBusyForWorkerDay(
    dateYmd: string,
    workerId: string | null | undefined
  ): Promise<BusyIntervalMs[]> {
    const w = workerId?.trim() ?? "";
    if (!w) return [];
    const key = `${dateYmd}|${w}`;
    const hit = mergedBusyCache.get(key);
    if (hit) return hit;
    let docs = dayDocsCache.get(dateYmd);
    if (!docs) {
      docs = await fetchSiteDayBookingDocsAdmin(db, siteId, dateYmd);
      dayDocsCache.set(dateYmd, docs);
    }
    const phaseBusy = workerPhaseBusyIntervalsUtcMsForDay(docs, w, dateYmd, siteTz);
    const merged = mergeBusyWithSalonBreaks(phaseBusy, dateYmd, siteTz, salonDayForBookingDate(dateYmd));
    mergedBusyCache.set(key, merged);
    return merged;
  }

  probeLoop: for (const probe of probes) {
    const slice = probe.slot;
    const bucket = getTimePreferenceBucketForSlot(slice.dateYmd, slice.timeHHmm, siteTz);
    const statusIn = [...WAITLIST_WAITING_STATUSES].join(", ");

    if (TEMP_DEBUG_WAITLIST_MATCH) {
      console.log(
        `[bookingWaitlist] DEBUG pre_query Searching for: Site [${siteId}], Date [${slice.dateYmd}], Status [${statusIn}], Worker [${slice.workerId ?? "(null)"}] (worker is match context; Firestore query is by status+preferredDateYmd only)`
      );
    }

    let rawForDate = rawCountByYmd.get(slice.dateYmd);
    if (rawForDate === undefined) {
      const rawSnap = await col.where("preferredDateYmd", "==", slice.dateYmd).limit(500).get();
      rawForDate = rawSnap.size;
      rawCountByYmd.set(slice.dateYmd, rawForDate);
      if (TEMP_DEBUG_WAITLIST_MATCH) {
        console.log(
          `[bookingWaitlist] DEBUG raw_count Found [${rawForDate}] total documents in the waitlist for this site/date regardless of other filters (path sites/${siteId}/bookingWaitlistEntries; docs have no siteId/tenantId field).`
        );
      }
    } else if (TEMP_DEBUG_WAITLIST_MATCH) {
      console.log(
        `[bookingWaitlist] DEBUG raw_count Found [${rawForDate}] total documents (cached for date ${slice.dateYmd}) for this site/date regardless of other filters.`
      );
    }

    let activeSnap;
    try {
      activeSnap = await col
        .where("status", "in", [...WAITLIST_WAITING_STATUSES])
        .where("preferredDateYmd", "==", slice.dateYmd)
        .limit(120)
        .get();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bookingWaitlist] waitlist_query_failed", { siteId, dateYmd: slice.dateYmd, error: msg });
      throw e;
    }

    if (TEMP_DEBUG_WAITLIST_MATCH) {
      console.log(
        `[bookingWaitlist] DEBUG status_query Found [${activeSnap.size}] documents with status in [${statusIn}] for Date [${slice.dateYmd}]`
      );
    }

    const sortedDocs = [...activeSnap.docs].sort((a, b) => {
      const da = a.data() as BookingWaitlistEntry;
      const dbEntry = b.data() as BookingWaitlistEntry;
      const wa = waitlistWorkerPreferenceRank(da, slice);
      const wb = waitlistWorkerPreferenceRank(dbEntry, slice);
      if (wa !== wb) return wa - wb;
      const ta = firestoreTsMs(a.data().createdAt);
      const tb = firestoreTsMs(b.data().createdAt);
      if (ta !== tb) return ta - tb;
      const qa = typeof da.queuePositionForDay === "number" ? da.queuePositionForDay : 1e9;
      const qb = typeof dbEntry.queuePositionForDay === "number" ? dbEntry.queuePositionForDay : 1e9;
      if (qa !== qb) return qa - qb;
      return a.id.localeCompare(b.id);
    });

    const matchOpts: WaitlistSlotMatchOptions =
      horizonBucketsEffective != null && horizonBucketsEffective.size > 0
        ? {
            matchAnyService,
            horizonBuckets: horizonBucketsEffective,
            timeBucket: bucket,
            strictOfferWall,
          }
        : { matchAnyService, timeBucket: bucket, strictOfferWall };
    const horizonLog =
      horizonBucketsEffective != null && horizonBucketsEffective.size > 0
        ? [...horizonBucketsEffective].sort()
        : undefined;
    let firstFilterRejectExplain: string | null = null;
    const acquireSkips: Array<{ entryId: string; reason: string }> = [];

    const getSalonDayForYmd = (ymd: string) => {
      const ref = fromZonedTime(`${ymd}T12:00:00`, siteTz);
      const jsDow = getJsDow(ref, siteTz);
      return getDayConfig(bookingSettings, jsDow) ?? { enabled: true, start: "09:00", end: "18:00" };
    };

    for (const doc of sortedDocs) {
      if (skipLocal.has(doc.id)) continue;
      const data = doc.data() as BookingWaitlistEntry;
      const phone = String(data.customerPhoneE164 ?? "").trim();
      if (phone && skipPhones.has(phone)) continue;

      let matchSlice = slice;
      let activeMatchOpts = matchOpts;
      let effectiveBucket = bucket;

      if (!waitlistEntryMatchesFreedSlot(data, slice, matchOpts)) {
        const slidSlice = trySlideWaitlistCapacitySliceForStrictTime(
          data,
          slice,
          matchOpts,
          siteTz,
          getSalonDayForYmd,
          strictOfferWall.nowMs
        );
        if (!slidSlice) {
          if (firstFilterRejectExplain === null) {
            firstFilterRejectExplain = explainWaitlistEntryMismatch(data, slice, matchOpts);
          }
          if (TEMP_DEBUG_WAITLIST_MATCH) {
            logDebugWaitlistPerPersonReject({
              customerName: data.customerName,
              docId: doc.id,
              entryStatus: data.status,
              kind: "filter",
              entry: data,
              slice,
              matchOpts,
              slotBucket: bucket,
            });
          }
          continue;
        }
        if (TEMP_DEBUG_WAITLIST_MATCH) {
          console.log(
            `[bookingWaitlist] DEBUG slide_offer_start segment_start=${slice.dateYmd}T${slice.timeHHmm} -> offer_start=${slidSlice.dateYmd}T${slidSlice.timeHHmm}`
          );
        }
        matchSlice = slidSlice;
        effectiveBucket = getTimePreferenceBucketForSlot(slidSlice.dateYmd, slidSlice.timeHHmm, siteTz);
        activeMatchOpts = {
          ...matchOpts,
          timeBucket: effectiveBucket,
        };
      }

      const lockId = waitlistSlotLockDocId(matchSlice.dateYmd, matchSlice.timeHHmm, matchSlice.workerId);

      const efEntry = Math.max(0, Math.round(Number(data.followUpDurationMin ?? 0)));
      const mergedPrimaryBusy = await getMergedBusyForWorkerDay(matchSlice.dateYmd, matchSlice.workerId);
      const primaryWid = matchSlice.workerId?.trim() || "";
      const fuWidResolved =
        efEntry > 0
          ? matchSlice.followUpWorkerId != null && String(matchSlice.followUpWorkerId).trim() !== ""
            ? String(matchSlice.followUpWorkerId).trim()
            : primaryWid
          : "";
      const mergedFuBusy: BusyIntervalMs[] | null =
        efEntry > 0 && fuWidResolved && fuWidResolved !== primaryWid
          ? await getMergedBusyForWorkerDay(matchSlice.dateYmd, fuWidResolved)
          : null;

      const hands = waitlistEntryHandsPhasesVsBusy(
        data,
        matchSlice,
        siteTz,
        mergedPrimaryBusy,
        mergedFuBusy
      );
      if (!hands.ok) {
        if (firstFilterRejectExplain === null) {
          firstFilterRejectExplain = hands.reason;
        }
        if (TEMP_DEBUG_WAITLIST_MATCH) {
          const displayName = data.customerName.trim() || doc.id;
          console.log(
            `[bookingWaitlist] DEBUG manual_filter User [${displayName}] rejected because: ${hands.reason}`
          );
        }
        continue;
      }
      if (TEMP_DEBUG_WAITLIST_MATCH && hands.waitOverlapBooking) {
        const displayName = data.customerName.trim() || doc.id;
        console.log(
          `[bookingWaitlist] DEBUG parallel_wait User [${displayName}] Accepted: Wait phase overlapping existing booking`
        );
      }

      const acq = await tryAcquireWaitlistSlotOffer(db, siteId, lockId, {
        lockDurationMs: WAITLIST_SLOT_LOCK_MS,
        customerPhoneE164: data.customerPhoneE164,
        entryId: doc.id,
        bypassLock,
      });
      if (!acq.ok) {
        if (TEMP_DEBUG_WAITLIST_MATCH) {
          logDebugWaitlistPerPersonReject({
            customerName: data.customerName,
            docId: doc.id,
            entryStatus: data.status,
            kind: "acquire",
            entry: data,
            slice: matchSlice,
            matchOpts: activeMatchOpts,
            slotBucket: effectiveBucket,
            acquireReason: acq.reason,
          });
        }
        if (acq.reason === "locked") {
          anySlotLocked = true;
          sliceAttempts.push({
            matchProbe: probe.label,
            dateYmd: slice.dateYmd,
            timeHHmm: slice.timeHHmm,
            workerId: slice.workerId,
            bucket,
            horizonBuckets: horizonLog,
            activeForDay: sortedDocs.length,
            firstQueueEntryId: sortedDocs[0]?.id ?? null,
            firstFilterReject: firstFilterRejectExplain ?? undefined,
            slotLocked: true,
            acquireSkips: acquireSkips.length ? acquireSkips : undefined,
          });
          continue probeLoop;
        }
        acquireSkips.push({ entryId: doc.id, reason: acq.reason });
        continue;
      }
      return {
        ok: true,
        docId: doc.id,
        data,
        capacitySlice: matchSlice,
        matchProbe: probe.label,
        lockId,
      };
    }

    const first = sortedDocs[0];
    sliceAttempts.push({
      matchProbe: probe.label,
      dateYmd: slice.dateYmd,
      timeHHmm: slice.timeHHmm,
      workerId: slice.workerId,
      bucket,
      horizonBuckets: horizonLog,
      activeForDay: sortedDocs.length,
      firstQueueEntryId: first?.id ?? null,
      firstFilterReject: firstFilterRejectExplain ?? undefined,
      acquireSkips: acquireSkips.length ? acquireSkips : undefined,
    });
  }

  return { ok: false, sliceAttempts, probesTried, anySlotLocked };
}

/**
 * Next matching waitlist row(s) for this freed slot; sends WhatsApp and sets `pending_offer`.
 * Greedy pack: after each successful offer, subtracts occupied wall time and keeps matching until
 * no segment longer than {@link MIN_PACK_SEGMENT_MIN} can be filled.
 */
export async function triggerWaitlistMatchForFreedSlot(
  siteId: string,
  slot: FreedBookingSlot,
  options?: TriggerWaitlistMatchOptions
): Promise<TriggerWaitlistMatchResult> {
  const db = getAdminDb();
  const skip = new Set((options?.skipEntryIds ?? []).filter(Boolean));
  const matchAnyService = options?.matchAnyService === true;
  const bypassLock = options?.bypassLock === true;

  const siteSnap = await db.collection("sites").doc(siteId).get();
  const siteData = siteSnap.data() as Record<string, unknown> | undefined;
  const siteTz = getSiteIanaTimezone(siteData);
  const cfg = siteData?.config as { salonName?: string; whatsappBrandName?: string } | undefined;
  const salonName = String(cfg?.salonName ?? cfg?.whatsappBrandName ?? "העסק").trim() || "העסק";

  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");

  const bookingSettings = await fetchBookingSettingsAdmin(db, siteId);
  const refNoon = fromZonedTime(`${slot.dateYmd}T12:00:00`, siteTz);
  const jsDow = getJsDow(refNoon, siteTz);
  const dayKey = String(jsDow) as keyof BookingSettings["days"];
  const rawSlotDay = bookingSettings.days?.[dayKey];
  const salonDayForSlot: DayHours = {
    ...(getDayConfig(bookingSettings, jsDow) ?? { enabled: true, start: "09:00", end: "18:00" }),
    breaks: rawSlotDay?.breaks,
  };

  const dayDocsCache = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();

  const { rootSlot, horizonBuckets } = await resolveHorizonRootSlot(
    db,
    siteId,
    slot,
    siteTz,
    options?.skipHorizonScan === true,
    salonDayForSlot,
    dayDocsCache
  );
  const horizonBucketsEffective =
    horizonBuckets != null && horizonBuckets.size > 0 ? horizonBuckets : null;

  let segments = buildAtomicWallSegments(rootSlot, siteTz, MIN_PACK_SEGMENT_MIN);
  const skipLocal = new Set(skip);
  const skipPhonesThisGap = new Set<string>();
  const entryIdsNotified: string[] = [];
  let structuralAttempted = false;
  let lastNoMatchLog: {
    sliceAttempts: SliceAttemptLog[];
    probesTried: string[];
    context: "structural" | "segment";
    segment?: FreedBookingSlot;
  } | null = null;

  for (let packRound = 0; packRound < MAX_PACK_OFFERS_PER_RUN; packRound++) {
    let found: FindMatchFromProbesResult | null = null;
    const strictOfferWall = {
      siteTz,
      salonDay: salonDayForSlot,
      nowMs: Date.now(),
    };

    if (!structuralAttempted) {
      structuralAttempted = true;
      const probes = expandFreedSlotToMatchSlices(rootSlot, siteTz);
      found = await findFirstMatchFromProbes(
        db,
        siteId,
        col,
        siteTz,
        skipLocal,
        skipPhonesThisGap,
        matchAnyService,
        bypassLock,
        probes,
        horizonBucketsEffective,
        strictOfferWall,
        bookingSettings,
        dayDocsCache
      );
      if (!found.ok) {
        lastNoMatchLog = {
          sliceAttempts: found.sliceAttempts,
          probesTried: found.probesTried,
          context: "structural",
        };
      }
    }

    if (!found || !found.ok) {
      const largeEnough = sortFreedSlotsByWallTime(
        segments.filter((s) => segmentDurationMin(s) > MIN_PACK_SEGMENT_MIN),
        siteTz
      );
      found = null;
      for (const seg of largeEnough) {
        const segTry = await findFirstMatchFromProbes(
          db,
          siteId,
          col,
          siteTz,
          skipLocal,
          skipPhonesThisGap,
          matchAnyService,
          bypassLock,
          expandFreedSlotToMatchSlices(seg, siteTz),
          horizonBucketsEffective,
          strictOfferWall,
          bookingSettings,
          dayDocsCache
        );
        if (segTry.ok) {
          found = segTry;
          break;
        }
        lastNoMatchLog = {
          sliceAttempts: segTry.sliceAttempts,
          probesTried: segTry.probesTried,
          context: "segment",
          segment: seg,
        };
      }
    }

    if (!found || !found.ok) {
      break;
    }

    const offer = waitlistOfferFromEntryAgainstCapacity(found.data, found.capacitySlice);
    const lockId = found.lockId;

    const now = admin.firestore.Timestamp.now();
    const expires = admin.firestore.Timestamp.fromMillis(Date.now() + WAITLIST_OFFER_TTL_MS);
    const offerWebConfirmToken = randomBytes(18).toString("hex");

    await col.doc(found.docId).update({
      status: "pending_offer",
      offer,
      offerSentAt: now,
      offerExpiresAt: expires,
      offerWebConfirmToken,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await expireStalePendingOffersForPhone(db, siteId, found.data.customerPhoneE164, found.docId);

    const dateLabel = formatHeDate(offer.dateYmd);
    const firstName = found.data.customerName.trim().split(/\s+/)[0] || "שלום";
    const timeDisp = (() => {
      const t = offer.timeHHmm.trim();
      return t.length >= 5 ? t.slice(0, 5) : t;
    })();

    const logBody =
      `שלום ${firstName}! התפנה תור ל${salonName} בתאריך ${dateLabel} בשעה ${timeDisp}. האם תרצו לשריין אותו?\n(הודעה זו בתוקף לשעתיים בלבד)`;

    try {
      await sendWhatsApp({
        toE164: found.data.customerPhoneE164,
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
          waitlistEntryId: found.docId,
          templateName: "booking_waitlist_slot_offer",
        },
        usageCategory: "service",
      });
    } catch (e) {
      console.error("[bookingWaitlist] send failed, reverting entry", e);
      await rollbackWaitlistOfferAcquire(
        db,
        siteId,
        lockId,
        found.data.customerPhoneE164,
        found.docId
      );
      const back = revertWaitingStatusFromEntry(found.data);
      await col.doc(found.docId).update({
        status: back,
        offer: admin.firestore.FieldValue.delete(),
        offerSentAt: admin.firestore.FieldValue.delete(),
        offerExpiresAt: admin.firestore.FieldValue.delete(),
        offerWebConfirmToken: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        notified: entryIdsNotified.length > 0,
        entryId: entryIdsNotified[0],
        entryIds: entryIdsNotified.length ? entryIdsNotified : undefined,
        reason: "send_failed",
      };
    }

    const appBase = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    if (appBase) {
      console.log("[bookingWaitlist] offer_web_url", {
        siteId,
        waitlistEntryId: found.docId,
        url: `${appBase}/site/${encodeURIComponent(siteId)}/waitlist-offer/${encodeURIComponent(found.docId)}?t=${encodeURIComponent(offerWebConfirmToken)}`,
      });
    }

    console.log("[bookingWaitlist] slot_offer_sent", {
      siteId,
      waitlistEntryId: found.docId,
      packRound,
      matchProbe: found.matchProbe,
      dateYmd: offer.dateYmd,
      timeHHmm: offer.timeHHmm,
    });

    entryIdsNotified.push(found.docId);
    skipLocal.add(found.docId);
    const offeredPhone = String(found.data.customerPhoneE164 ?? "").trim();
    if (offeredPhone) skipPhonesThisGap.add(offeredPhone);

    const occ = wallOccupanciesFromEntryAndCapacity(found.data, found.capacitySlice, siteTz);
    segments = applyWallOccupanciesToAtomicSegments(segments, occ, siteTz, MIN_PACK_SEGMENT_MIN);
  }

  if (entryIdsNotified.length === 0) {
    console.log("[bookingWaitlist] no_matching_waitlist_entry", {
      siteId,
      dateYmd: slot.dateYmd,
      timeHHmm: slot.timeHHmm,
      workerId: slot.workerId,
      freedService: slot.serviceName,
      siteTz,
      matchAnyService,
      slotPrimaryMin: slot.primaryDurationMin,
      slotWaitMin: slot.waitMinutes,
      slotFollowUpMin: slot.followUpDurationMin,
      horizonRootPrimaryMin:
        rootSlot.primaryDurationMin !== slot.primaryDurationMin ||
        rootSlot.timeHHmm !== slot.timeHHmm
          ? rootSlot.primaryDurationMin
          : undefined,
      horizonBucketsTried: horizonBucketsEffective ? [...horizonBucketsEffective].sort() : undefined,
      packMode: "greedy_segments",
      lastProbeContext: lastNoMatchLog?.context,
      probesTried: lastNoMatchLog?.probesTried,
      sliceAttempts: lastNoMatchLog?.sliceAttempts.length ? lastNoMatchLog.sliceAttempts : undefined,
      segmentHint: lastNoMatchLog?.segment
        ? {
            dateYmd: lastNoMatchLog.segment.dateYmd,
            timeHHmm: lastNoMatchLog.segment.timeHHmm,
            workerId: lastNoMatchLog.segment.workerId,
            durationMin: segmentDurationMin(lastNoMatchLog.segment),
          }
        : undefined,
    });
    return { notified: false, reason: "no_match" };
  }

  console.log("[bookingWaitlist] pack_complete", {
    siteId,
    rootDateYmd: rootSlot.dateYmd,
    rootTimeHHmm: rootSlot.timeHHmm,
    cancellationTimeHHmm: slot.timeHHmm,
    notifiedCount: entryIdsNotified.length,
    waitlistEntryIds: entryIdsNotified,
    usedHorizonBuckets: horizonBucketsEffective ? [...horizonBucketsEffective].sort() : undefined,
  });

  return {
    notified: true,
    entryId: entryIdsNotified[0],
    entryIds: entryIdsNotified,
  };
}

/**
 * Spec-style entry point: `date` and `startTime` must match `slot.dateYmd` / `slot.timeHHmm`.
 */
/** `tenantId` here is the Firestore `sites` document id (same as booking/join `siteId`). */
export async function triggerWaitlistMatch(
  tenantId: string,
  date: string,
  startTime: string,
  slot: FreedBookingSlot,
  options?: TriggerWaitlistMatchOptions
): Promise<TriggerWaitlistMatchResult> {
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
