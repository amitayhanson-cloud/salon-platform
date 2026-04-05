import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { BookingWaitlistEntry, BookingWaitlistOfferSlot } from "@/types/bookingWaitlist";
import type { TimePreferenceValue } from "@/types/timePreference";
import {
  addWallMinutesInTimezone,
  entryAcceptsTimeBucket,
  getTimePreferenceBucketForSlot,
  normalizeTimePreferenceArray,
} from "./timeBuckets";

export type FreedBookingSlot = {
  dateYmd: string;
  timeHHmm: string;
  workerId: string | null;
  workerName?: string | null;
  serviceTypeId: string | null;
  serviceId: string | null;
  serviceName: string;
  /** Primary segment on workerId (minutes). */
  durationMin: number;
  primaryDurationMin: number;
  waitMinutes: number;
  followUpDurationMin: number;
  followUpWorkerId: string | null;
  followUpWorkerName?: string | null;
  followUpServiceName?: string | null;
};

export type FreedSlotMatchProbeLabel = "full" | "primary_only" | "follow_up_only";

export type FreedSlotMatchProbe = {
  label: FreedSlotMatchProbeLabel;
  slot: FreedBookingSlot;
};

function normalizeHHmm(t: string): string {
  const s = String(t ?? "").trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Dedupe probes that would match the same structure (e.g. primary-only identical to full when no gap/fu). */
function freedSlotProbeKey(s: FreedBookingSlot): string {
  const sn = primaryServiceLabelForMatch(s.serviceName || "");
  const fn = primaryServiceLabelForMatch(s.followUpServiceName || "");
  return [
    s.dateYmd,
    normalizeHHmm(s.timeHHmm),
    s.workerId ?? "",
    s.followUpWorkerId ?? "",
    Math.max(1, Math.round(Number(s.primaryDurationMin ?? s.durationMin ?? 60))),
    Math.max(0, Math.round(Number(s.waitMinutes ?? 0))),
    Math.max(0, Math.round(Number(s.followUpDurationMin ?? 0))),
    sn,
    fn,
  ].join("|");
}

/**
 * After a multi-phase cancel, match against the full merged visit first, then primary-only and follow-up-only
 * segments so single-phase waitlist rows can use freed wall time without needing the full gap+phase2 footprint.
 */
export function expandFreedSlotToMatchSlices(
  slot: FreedBookingSlot,
  siteTz: string
): FreedSlotMatchProbe[] {
  const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? slot.durationMin ?? 60)));
  const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
  const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));

  const out: FreedSlotMatchProbe[] = [];
  const seen = new Set<string>();

  const push = (label: FreedSlotMatchProbeLabel, s: FreedBookingSlot) => {
    const k = freedSlotProbeKey(s);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ label, slot: s });
  };

  push("full", {
    ...slot,
    durationMin: sp,
    primaryDurationMin: sp,
    waitMinutes: sw,
    followUpDurationMin: sf,
  });

  if (sw > 0 || sf > 0) {
    push("primary_only", {
      ...slot,
      durationMin: sp,
      primaryDurationMin: sp,
      waitMinutes: 0,
      followUpDurationMin: 0,
      followUpWorkerId: null,
      followUpWorkerName: null,
      followUpServiceName: null,
    });
  }

  if (sf > 0) {
    const phase2 = addWallMinutesInTimezone(slot.dateYmd, normalizeHHmm(slot.timeHHmm), sp + sw, siteTz);
    if (phase2) {
      const wid =
        slot.followUpWorkerId != null && String(slot.followUpWorkerId).trim() !== ""
          ? String(slot.followUpWorkerId).trim()
          : slot.workerId;
      const wname = slot.followUpWorkerName ?? slot.workerName ?? null;
      const svc =
        slot.followUpServiceName != null && String(slot.followUpServiceName).trim() !== ""
          ? String(slot.followUpServiceName).trim()
          : slot.serviceName;
      push("follow_up_only", {
        dateYmd: phase2.dateYmd,
        timeHHmm: phase2.timeHHmm,
        workerId: wid?.trim() ? wid : null,
        workerName: wname,
        serviceTypeId: null,
        serviceId: null,
        serviceName: svc,
        durationMin: sf,
        primaryDurationMin: sf,
        waitMinutes: 0,
        followUpDurationMin: 0,
        followUpWorkerId: null,
        followUpWorkerName: null,
        followUpServiceName: null,
      });
    }
  }

  return out;
}

export function freedSlotToOfferSlot(slot: FreedBookingSlot): BookingWaitlistOfferSlot {
  const primaryDurationMin = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? slot.durationMin ?? 60)));
  return {
    dateYmd: slot.dateYmd,
    timeHHmm: slot.timeHHmm,
    workerId: slot.workerId,
    workerName: slot.workerName ?? null,
    durationMin: primaryDurationMin,
    serviceName: slot.serviceName,
    waitMinutes: Math.max(0, Math.round(Number(slot.waitMinutes ?? 0))),
    followUpDurationMin: Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0))),
    followUpWorkerId: slot.followUpWorkerId,
    followUpWorkerName: slot.followUpWorkerName ?? null,
    followUpServiceName: slot.followUpServiceName ?? null,
    primaryDurationMin,
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** First segment before " / " or " | " or " - " — aligns catalog names with "שירות / סוג" on bookings. */
function primaryServiceLabelForMatch(s: string): string {
  const t = norm(s);
  if (!t) return "";
  const parts = t.split(/\s*[/|]\s*|\s+-\s+/);
  return (parts[0] ?? t).trim();
}

/**
 * Whether the customer's footprint fits inside the freed visit structure (same start time).
 *
 * **Phase folding:** If the slot is one contiguous primary column (`waitMinutes` and `followUpDurationMin`
 * both 0), a multi-phase entry (primary + wait + follow-up) fits when `primary >= entryPrimary` and
 * `primary >= entryPrimary + entryWait + entryFollowUp` (virtual carve). Cross-worker follow-up on the
 * slot (`followUpWorkerId` ≠ `workerId`) disables folding — the gap must expose a real follow-up segment.
 *
 * **Parallel processing:** Wait minutes do not consume worker “hands” vs the slot shape. When the slot has an
 * explicit follow-up segment (`followUpDurationMin` > 0), we still require `ef <= sf` and `ep <= sp`, but we
 * do **not** require `entryWait <= slotWait` — the client may wait (overlap other bookings) longer than the
 * cancellation’s inter-phase gap.
 */
export function waitlistEntryFitsFreedStructure(
  entry: Pick<
    BookingWaitlistEntry,
    "primaryDurationMin" | "waitMinutes" | "followUpDurationMin"
  >,
  slot: Pick<
    FreedBookingSlot,
    | "primaryDurationMin"
    | "waitMinutes"
    | "followUpDurationMin"
    | "followUpWorkerId"
    | "workerId"
  >
): boolean {
  const ep = Math.max(
    1,
    Math.round(Number(entry.primaryDurationMin ?? 60))
  );
  const ew = Math.max(0, Math.round(Number(entry.waitMinutes ?? 0)));
  const ef = Math.max(0, Math.round(Number(entry.followUpDurationMin ?? 0)));

  const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? 60)));
  const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
  const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));

  if (ep > sp) return false;

  const entryTotalMin = ep + ew + ef;
  const slotIsSingleContiguousColumn = sw === 0 && sf === 0;

  if (slotIsSingleContiguousColumn && entryTotalMin <= sp) {
    if (ef > 0) {
      const wMain = slot.workerId?.trim() || null;
      const wFuRaw =
        slot.followUpWorkerId != null && String(slot.followUpWorkerId).trim() !== ""
          ? String(slot.followUpWorkerId).trim()
          : null;
      if (wFuRaw && wMain && wFuRaw !== wMain) {
        return false;
      }
    }
    return true;
  }

  if (ef > 0) {
    if (sf <= 0) return false;
    if (ef > sf) return false;
  }

  return true;
}

export type WaitlistSlotMatchOptions = {
  /** When true (e.g. admin "fill empty slot"), skip service type/id/name equality checks. */
  matchAnyService?: boolean;
  /** When set, entry must accept this time-of-day bucket (or "anytime"). */
  timeBucket?: Exclude<TimePreferenceValue, "anytime">;
  /**
   * When non-empty, the freed window touches these day buckets (horizon scan). Entry must prefer
   * at least one of them, and still pass {@link timeBucket} for the concrete offer start.
   */
  horizonBuckets?: ReadonlySet<Exclude<TimePreferenceValue, "anytime">> | null;
};

/** Busy interval on a worker timeline (Firestore `startAt` / `endAt` semantics, end exclusive). */
export type BusyIntervalMs = { startMs: number; endMsExclusive: number };

export function siteDayWallBoundsUtcMs(
  dateYmd: string,
  siteTz: string
): { dayStartMs: number; dayEndExclusiveMs: number } | null {
  try {
    let t = fromZonedTime(`${dateYmd}T00:00:00`, siteTz);
    const dayStartMs = t.getTime();
    for (let i = 0; i < 24 * 4; i++) {
      const next = addMinutes(t, 30);
      const y = formatInTimeZone(next, siteTz, "yyyy-MM-dd");
      if (y !== dateYmd) {
        return { dayStartMs, dayEndExclusiveMs: next.getTime() };
      }
      t = next;
    }
    return { dayStartMs, dayEndExclusiveMs: dayStartMs + 86400000 };
  } catch {
    return null;
  }
}

export function mergeBusyIntervalsMs(intervals: BusyIntervalMs[]): BusyIntervalMs[] {
  const sorted = intervals
    .map((i) => ({
      startMs: Math.min(i.startMs, i.endMsExclusive),
      endMsExclusive: Math.max(i.startMs, i.endMsExclusive),
    }))
    .filter((i) => i.endMsExclusive > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const out: BusyIntervalMs[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (!last || cur.startMs > last.endMsExclusive) {
      out.push({ ...cur });
    } else {
      last.endMsExclusive = Math.max(last.endMsExclusive, cur.endMsExclusive);
    }
  }
  return out;
}

/**
 * Removes wall time from busy intervals (splits intervals). Used so horizon gaps can span a cancellation’s
 * inter-phase wait tunnel where the primary worker may be booked with other clients.
 */
export function subtractOpenIntervalFromBusyIntervals(
  intervals: BusyIntervalMs[],
  removeStartMs: number,
  removeEndExclusiveMs: number
): BusyIntervalMs[] {
  if (removeEndExclusiveMs <= removeStartMs) return mergeBusyIntervalsMs(intervals);
  const out: BusyIntervalMs[] = [];
  for (const iv of intervals) {
    const a = iv.startMs;
    const b = iv.endMsExclusive;
    if (b <= removeStartMs || a >= removeEndExclusiveMs) {
      out.push(iv);
      continue;
    }
    if (a < removeStartMs) {
      out.push({ startMs: a, endMsExclusive: Math.min(b, removeStartMs) });
    }
    if (b > removeEndExclusiveMs) {
      out.push({ startMs: Math.max(a, removeEndExclusiveMs), endMsExclusive: b });
    }
  }
  return mergeBusyIntervalsMs(out);
}

/** True if any merged busy interval overlaps [a0, a1) (half-open). */
export function mergedBusyOverlapsOpenInterval(
  busy: BusyIntervalMs[],
  startMs: number,
  endExclusiveMs: number
): boolean {
  if (endExclusiveMs <= startMs) return false;
  for (const b of busy) {
    if (endExclusiveMs > b.startMs && startMs < b.endMsExclusive) return true;
  }
  return false;
}

/**
 * Wall interval for the cancelled booking’s follow-up hands segment (same geometry as offers).
 */
export function cancellationFollowUpHandsWindowUtcMs(
  slot: FreedBookingSlot,
  siteTz: string
): { startMs: number; endExclusiveMs: number } | null {
  const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? 60)));
  const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
  const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));
  if (sf <= 0) return null;
  const hm0 = normalizeHHmm(slot.timeHHmm);
  const fStartWall = addWallMinutesInTimezone(slot.dateYmd, hm0, sp + sw, siteTz);
  if (!fStartWall) return null;
  const fEndWall = addWallMinutesInTimezone(
    fStartWall.dateYmd,
    normalizeHHmm(fStartWall.timeHHmm),
    sf,
    siteTz
  );
  if (!fEndWall) return null;
  try {
    const s = fromZonedTime(
      `${fStartWall.dateYmd}T${normalizeHHmm(fStartWall.timeHHmm)}:00`,
      siteTz
    ).getTime();
    const e = fromZonedTime(
      `${fEndWall.dateYmd}T${normalizeHHmm(fEndWall.timeHHmm)}:00`,
      siteTz
    ).getTime();
    return { startMs: s, endExclusiveMs: e };
  } catch {
    return null;
  }
}

/**
 * Calendar window between cancelled primary end and follow-up start (inter-phase wait on primary column).
 * Other bookings here do not break horizon “contiguous gap” for expansion.
 */
export function cancellationInterPhaseWaitTunnelUtcMs(
  slot: FreedBookingSlot,
  siteTz: string
): { startMs: number; endExclusiveMs: number } | null {
  const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? 60)));
  const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
  const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));
  if (sw <= 0 || sf <= 0) return null;
  const hm0 = normalizeHHmm(slot.timeHHmm);
  const peWall = addWallMinutesInTimezone(slot.dateYmd, hm0, sp, siteTz);
  const fuStartWall = addWallMinutesInTimezone(slot.dateYmd, hm0, sp + sw, siteTz);
  if (!peWall || !fuStartWall) return null;
  try {
    const peMs = fromZonedTime(
      `${peWall.dateYmd}T${normalizeHHmm(peWall.timeHHmm)}:00`,
      siteTz
    ).getTime();
    const fuMs = fromZonedTime(
      `${fuStartWall.dateYmd}T${normalizeHHmm(fuStartWall.timeHHmm)}:00`,
      siteTz
    ).getTime();
    if (fuMs <= peMs) return null;
    return { startMs: peMs, endExclusiveMs: fuMs };
  } catch {
    return null;
  }
}

/**
 * Worker “hands” check: primary and follow-up segments must not overlap merged busy; wait may overlap freely.
 * Returns whether any booking overlapped the wait window (for logging “Accepted: Wait phase overlapping…”).
 */
export function waitlistEntryHandsPhasesVsBusy(
  entry: Pick<BookingWaitlistEntry, "primaryDurationMin" | "waitMinutes" | "followUpDurationMin">,
  capacity: FreedBookingSlot,
  siteTz: string,
  primaryWorkerMergedBusy: BusyIntervalMs[],
  followUpWorkerMergedBusy: BusyIntervalMs[] | null
): { ok: true; waitOverlapBooking?: boolean } | { ok: false; reason: string } {
  const ep = Math.max(1, Math.round(Number(entry.primaryDurationMin ?? 60)));
  const ew = Math.max(0, Math.round(Number(entry.waitMinutes ?? 0)));
  const ef = Math.max(0, Math.round(Number(entry.followUpDurationMin ?? 0)));

  const hm0 = normalizeHHmm(capacity.timeHHmm);
  let t0: number;
  try {
    t0 = fromZonedTime(`${capacity.dateYmd}T${hm0}:00`, siteTz).getTime();
  } catch {
    return { ok: false, reason: "Rejected: Primary/FU overlap (invalid start)" };
  }

  const pEndWall = addWallMinutesInTimezone(capacity.dateYmd, hm0, ep, siteTz);
  if (!pEndWall) return { ok: false, reason: "Rejected: Primary/FU overlap (primary end)" };
  let peMs: number;
  try {
    peMs = fromZonedTime(
      `${pEndWall.dateYmd}T${normalizeHHmm(pEndWall.timeHHmm)}:00`,
      siteTz
    ).getTime();
  } catch {
    return { ok: false, reason: "Rejected: Primary/FU overlap (primary end)" };
  }

  if (mergedBusyOverlapsOpenInterval(primaryWorkerMergedBusy, t0, peMs)) {
    return { ok: false, reason: "Rejected: Primary/FU overlap (primary)" };
  }

  let waitOverlapBooking = false;
  if (ew > 0) {
    const wEndWall = addWallMinutesInTimezone(capacity.dateYmd, hm0, ep + ew, siteTz);
    if (!wEndWall) return { ok: false, reason: "Rejected: Primary/FU overlap (wait end)" };
    let waitEndMs: number;
    try {
      waitEndMs = fromZonedTime(
        `${wEndWall.dateYmd}T${normalizeHHmm(wEndWall.timeHHmm)}:00`,
        siteTz
      ).getTime();
    } catch {
      return { ok: false, reason: "Rejected: Primary/FU overlap (wait end)" };
    }
    if (mergedBusyOverlapsOpenInterval(primaryWorkerMergedBusy, peMs, waitEndMs)) {
      waitOverlapBooking = true;
    }
  }

  if (ef > 0) {
    const fStartWall = addWallMinutesInTimezone(capacity.dateYmd, hm0, ep + ew, siteTz);
    if (!fStartWall) return { ok: false, reason: "Rejected: Primary/FU overlap (fu start)" };
    let fuStartMs: number;
    try {
      fuStartMs = fromZonedTime(
        `${fStartWall.dateYmd}T${normalizeHHmm(fStartWall.timeHHmm)}:00`,
        siteTz
      ).getTime();
    } catch {
      return { ok: false, reason: "Rejected: Primary/FU overlap (fu start)" };
    }
    const fEndWall = addWallMinutesInTimezone(
      fStartWall.dateYmd,
      normalizeHHmm(fStartWall.timeHHmm),
      ef,
      siteTz
    );
    if (!fEndWall) return { ok: false, reason: "Rejected: Primary/FU overlap (fu end)" };
    let fuEndMs: number;
    try {
      fuEndMs = fromZonedTime(
        `${fEndWall.dateYmd}T${normalizeHHmm(fEndWall.timeHHmm)}:00`,
        siteTz
      ).getTime();
    } catch {
      return { ok: false, reason: "Rejected: Primary/FU overlap (fu end)" };
    }

    const primaryWid = capacity.workerId?.trim() || "";
    const fuWid =
      capacity.followUpWorkerId != null && String(capacity.followUpWorkerId).trim() !== ""
        ? String(capacity.followUpWorkerId).trim()
        : primaryWid;

    const busyForFu =
      fuWid === primaryWid ? primaryWorkerMergedBusy : followUpWorkerMergedBusy;
    if (fuWid !== primaryWid && busyForFu == null) {
      return { ok: false, reason: "Rejected: Primary/FU overlap (follow-up worker busy data missing)" };
    }
    if (mergedBusyOverlapsOpenInterval(busyForFu ?? primaryWorkerMergedBusy, fuStartMs, fuEndMs)) {
      return { ok: false, reason: "Rejected: Primary/FU overlap (follow-up)" };
    }
  }

  return { ok: true, waitOverlapBooking };
}

/**
 * Largest wall-time gap inside [dayStart, dayEnd) that fully contains the cancellation window.
 */
export function findContiguousGapContainingWindow(
  mergedBusy: BusyIntervalMs[],
  window: { startMs: number; endMsExclusive: number },
  dayStartMs: number,
  dayEndExclusiveMs: number
): { gapStartMs: number; gapEndExclusiveMs: number } | null {
  const c0 = window.startMs;
  const c1 = window.endMsExclusive;
  if (c1 <= c0) return null;

  const gaps: { gapStartMs: number; gapEndExclusiveMs: number }[] = [];
  let x = dayStartMs;
  const sorted = [...mergedBusy].sort((a, b) => a.startMs - b.startMs);
  for (const b of sorted) {
    const bs = Math.max(b.startMs, dayStartMs);
    const be = Math.min(b.endMsExclusive, dayEndExclusiveMs);
    if (be <= dayStartMs || bs >= dayEndExclusiveMs) continue;
    if (bs > x && bs <= dayEndExclusiveMs) {
      gaps.push({ gapStartMs: x, gapEndExclusiveMs: Math.min(bs, dayEndExclusiveMs) });
    }
    x = Math.max(x, b.endMsExclusive, dayStartMs);
    if (x >= dayEndExclusiveMs) break;
  }
  if (x < dayEndExclusiveMs) {
    gaps.push({ gapStartMs: x, gapEndExclusiveMs: dayEndExclusiveMs });
  }

  for (const g of gaps) {
    if (c0 >= g.gapStartMs && c1 <= g.gapEndExclusiveMs && c0 < g.gapEndExclusiveMs) {
      return g;
    }
  }
  return null;
}

/** Wall span of the cancelled visit on the primary worker column (primary + wait + follow-up). */
export function cancellationFootprintWindowUtcMs(
  slot: FreedBookingSlot,
  siteTz: string
): { startMs: number; endMsExclusive: number } | null {
  const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? slot.durationMin ?? 60)));
  const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
  const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));
  const total = sp + sw + sf;
  const hm = normalizeHHmm(slot.timeHHmm);
  try {
    const startMs = fromZonedTime(`${slot.dateYmd}T${hm}:00`, siteTz).getTime();
    const endWall = addWallMinutesInTimezone(slot.dateYmd, hm, total, siteTz);
    if (!endWall) return null;
    const endHm = normalizeHHmm(endWall.timeHHmm);
    const endMsExclusive = fromZonedTime(`${endWall.dateYmd}T${endHm}:00`, siteTz).getTime();
    return { startMs, endMsExclusive };
  } catch {
    return null;
  }
}

export function buildMaxFreedSlotFromHorizonGap(
  gap: { gapStartMs: number; gapEndExclusiveMs: number },
  siteTz: string,
  cancellationSlot: FreedBookingSlot
): FreedBookingSlot | null {
  const durMin = Math.round((gap.gapEndExclusiveMs - gap.gapStartMs) / 60_000);
  if (durMin < 1) return null;
  const ymd = formatInTimeZone(gap.gapStartMs, siteTz, "yyyy-MM-dd");
  const hm = formatInTimeZone(gap.gapStartMs, siteTz, "HH:mm");
  const timeHHmm = hm.length >= 5 ? hm.slice(0, 5) : hm;
  return {
    ...cancellationSlot,
    dateYmd: ymd,
    timeHHmm,
    durationMin: durMin,
    primaryDurationMin: durMin,
    waitMinutes: 0,
    followUpDurationMin: 0,
    followUpWorkerId: null,
    followUpWorkerName: null,
    followUpServiceName: null,
  };
}

export function collectBucketsAlongWallIntervalMs(
  startMs: number,
  endExclusiveMs: number,
  siteTz: string
): Exclude<TimePreferenceValue, "anytime">[] {
  const set = new Set<Exclude<TimePreferenceValue, "anytime">>();
  const STEP = 15 * 60_000;
  for (let t = startMs; t < endExclusiveMs; t += STEP) {
    const ymd = formatInTimeZone(t, siteTz, "yyyy-MM-dd");
    const hms = formatInTimeZone(t, siteTz, "HH:mm");
    set.add(getTimePreferenceBucketForSlot(ymd, hms, siteTz));
  }
  if (endExclusiveMs > startMs) {
    const last = endExclusiveMs - 1;
    const ymd = formatInTimeZone(last, siteTz, "yyyy-MM-dd");
    const hms = formatInTimeZone(last, siteTz, "HH:mm");
    set.add(getTimePreferenceBucketForSlot(ymd, hms, siteTz));
  }
  return [...set];
}

export function entryAcceptsAnyHorizonBucket(
  rawPrefs: unknown,
  horizonBuckets: ReadonlySet<Exclude<TimePreferenceValue, "anytime">>
): boolean {
  const list = normalizeTimePreferenceArray(rawPrefs);
  if (list.includes("anytime")) return true;
  for (const p of list) {
    if (p === "morning" || p === "afternoon" || p === "evening") {
      if (horizonBuckets.has(p)) return true;
    }
  }
  return false;
}

type WaitlistEntryForServiceMatch = Pick<
  BookingWaitlistEntry,
  "serviceTypeId" | "serviceId" | "serviceName"
>;

/** serviceTypeId / serviceId / fuzzy name (incl. primary segment before " / "). */
export function waitlistEntryServiceMatchesFreedSlot(
  entry: WaitlistEntryForServiceMatch,
  slot: Pick<FreedBookingSlot, "serviceTypeId" | "serviceId" | "serviceName">
): boolean {
  const et = entry.serviceTypeId?.trim() || null;
  const st = slot.serviceTypeId?.trim() || null;
  let serviceOk = false;
  if (et && st && et === st) serviceOk = true;
  if (!serviceOk) {
    const eid = entry.serviceId?.trim() || null;
    const sid = slot.serviceId?.trim() || null;
    if (eid && sid && eid === sid) serviceOk = true;
  }
  if (!serviceOk) {
    const en = primaryServiceLabelForMatch(entry.serviceName || "");
    const sn = primaryServiceLabelForMatch(slot.serviceName || "");
    if (en && sn && (en === sn || sn.includes(en) || en.includes(sn))) serviceOk = true;
  }
  return serviceOk;
}

/** Human-readable first failure for logs (not for security-sensitive production noise). */
export function explainWaitlistEntryMismatch(
  entry: Pick<
    BookingWaitlistEntry,
    | "serviceTypeId"
    | "serviceId"
    | "serviceName"
    | "preferredDateYmd"
    | "primaryDurationMin"
    | "waitMinutes"
    | "followUpDurationMin"
    | "timePreference"
  >,
  slot: FreedBookingSlot,
  options?: WaitlistSlotMatchOptions
): string {
  const prefDate = entry.preferredDateYmd?.trim();
  if (!prefDate || prefDate !== slot.dateYmd) {
    return `date_mismatch entryYmd=${prefDate ?? "(empty)"} slotYmd=${slot.dateYmd}`;
  }
  const hb = options?.horizonBuckets;
  if (hb != null && hb.size > 0 && !entryAcceptsAnyHorizonBucket(entry.timePreference, hb)) {
    return `horizon_buckets entry=${JSON.stringify(entry.timePreference ?? null)} allowed=${[...hb].sort().join(",")}`;
  }
  if (options?.timeBucket != null && !entryAcceptsTimeBucket(entry.timePreference, options.timeBucket)) {
    return `time_bucket entry=${JSON.stringify(entry.timePreference ?? null)} slotBucket=${options.timeBucket}`;
  }
  if (!options?.matchAnyService && !waitlistEntryServiceMatchesFreedSlot(entry, slot)) {
    return `service_mismatch entry(name=${entry.serviceName ?? ""},typeId=${entry.serviceTypeId ?? ""},svcId=${entry.serviceId ?? ""}) vs slot(name=${slot.serviceName},typeId=${slot.serviceTypeId ?? ""},svcId=${slot.serviceId ?? ""})`;
  }
  if (!waitlistEntryFitsFreedStructure(entry, slot)) {
    const ep = Math.max(1, Math.round(Number(entry.primaryDurationMin ?? 60)));
    const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? 60)));
    const ew = Math.max(0, Math.round(Number(entry.waitMinutes ?? 0)));
    const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
    const ef = Math.max(0, Math.round(Number(entry.followUpDurationMin ?? 0)));
    const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));
    const entryTotal = ep + ew + ef;
    const singleBlock = sw === 0 && sf === 0;
    let hint = "";
    if (singleBlock && entryTotal <= sp && ep <= sp && ef > 0) {
      const wMain = slot.workerId?.trim() || "";
      const wFu =
        slot.followUpWorkerId != null && String(slot.followUpWorkerId).trim() !== ""
          ? String(slot.followUpWorkerId).trim()
          : "";
      if (wFu && wMain && wFu !== wMain) {
        hint =
          "; phase_folding_blocked=cross_worker_followup (slot has different followUpWorkerId; need explicit fu segment in cancellation)";
      }
    } else if (singleBlock && entryTotal > sp) {
      hint = `; need_contiguous_single_column >= ${entryTotal}m (entry total) but slot primary=${sp}m`;
    } else if (ep > sp) {
      hint = `; entry_primary ${ep}m exceeds slot_primary ${sp}m`;
    }
    return `duration_or_phases entry primary=${ep}m wait=${ew} fu=${ef}m (total ${entryTotal}m) vs slot primary=${sp}m wait=${sw} fu=${sf}m${hint}`;
  }
  return "ok";
}

/** Lower = earlier in queue when sorting (best match first). */
export function waitlistWorkerPreferenceRank(
  entry: Pick<BookingWaitlistEntry, "preferredWorkerId">,
  slot: Pick<FreedBookingSlot, "workerId">
): number {
  const prefW = entry.preferredWorkerId?.trim() || null;
  const slotW = slot.workerId?.trim() || null;
  if (!prefW) return 1;
  if (!slotW) return 2;
  return prefW === slotW ? 0 : 2;
}

/** Whether a waitlist entry wants this freed slot (service + date + duration/follow-up fit). Worker is ordering only. */
export function waitlistEntryMatchesFreedSlot(
  entry: Pick<
    BookingWaitlistEntry,
    | "serviceTypeId"
    | "serviceId"
    | "serviceName"
    | "preferredDateYmd"
    | "preferredWorkerId"
    | "primaryDurationMin"
    | "waitMinutes"
    | "followUpDurationMin"
    | "timePreference"
  >,
  slot: FreedBookingSlot,
  options?: WaitlistSlotMatchOptions
): boolean {
  const prefDate = entry.preferredDateYmd?.trim();
  if (!prefDate || prefDate !== slot.dateYmd) return false;

  // Preferred worker is a sort priority, not a hard filter — otherwise a waitlist signup
  // with the "last selected" stylist never matches a freed slot on another column.

  const hb = options?.horizonBuckets;
  if (hb != null && hb.size > 0 && !entryAcceptsAnyHorizonBucket(entry.timePreference, hb)) {
    return false;
  }
  if (options?.timeBucket != null && !entryAcceptsTimeBucket(entry.timePreference, options.timeBucket)) {
    return false;
  }

  if (!options?.matchAnyService) {
    if (!waitlistEntryServiceMatchesFreedSlot(entry, slot)) return false;
  }

  return waitlistEntryFitsFreedStructure(entry, slot);
}

/** One contiguous occupied interval on a worker column (site wall clock). */
export type WallOccupancy = {
  dateYmd: string;
  timeHHmm: string;
  workerId: string | null;
  durationMin: number;
};

function wallInstantMs(dateYmd: string, timeHHmm: string, timeZone: string): number | null {
  const hm = normalizeHHmm(timeHHmm);
  try {
    return fromZonedTime(`${dateYmd}T${hm}:00`, timeZone).getTime();
  } catch {
    return null;
  }
}

export function segmentDurationMin(seg: FreedBookingSlot): number {
  return Math.max(1, Math.round(Number(seg.primaryDurationMin ?? seg.durationMin ?? 60)));
}

export function sortFreedSlotsByWallTime(segments: FreedBookingSlot[], timeZone: string): FreedBookingSlot[] {
  return [...segments].sort((a, b) => {
    const ma = wallInstantMs(a.dateYmd, a.timeHHmm, timeZone);
    const mb = wallInstantMs(b.dateYmd, b.timeHHmm, timeZone);
    if (ma != null && mb != null && ma !== mb) return ma - mb;
    return (
      a.dateYmd.localeCompare(b.dateYmd) || normalizeHHmm(a.timeHHmm).localeCompare(normalizeHHmm(b.timeHHmm))
    );
  });
}

function cloneAtomicSegment(
  base: FreedBookingSlot,
  dateYmd: string,
  timeHHmm: string,
  durationMin: number
): FreedBookingSlot {
  return {
    ...base,
    dateYmd,
    timeHHmm,
    durationMin,
    primaryDurationMin: durationMin,
    waitMinutes: 0,
    followUpDurationMin: 0,
    followUpWorkerId: null,
    followUpWorkerName: null,
    followUpServiceName: null,
  };
}

/**
 * Non-overlapping atomic column segments for worker “hands” (wait=0, fu=0 per segment).
 * Inter-phase **wait** is not emitted: it costs zero capacity and may overlap other bookings.
 *
 * When there is **no follow-up** on the cancellation, an intra-visit wait shorter than `minGapMin` is
 * folded into the first segment’s duration (same-column contiguous wall time).
 */
export function buildAtomicWallSegments(
  slot: FreedBookingSlot,
  siteTz: string,
  minGapMin = 15
): FreedBookingSlot[] {
  const sp = Math.max(1, Math.round(Number(slot.primaryDurationMin ?? slot.durationMin ?? 60)));
  const sw = Math.max(0, Math.round(Number(slot.waitMinutes ?? 0)));
  const sf = Math.max(0, Math.round(Number(slot.followUpDurationMin ?? 0)));

  const out: FreedBookingSlot[] = [];

  const firstPrimaryColumnMin =
    sf === 0 && sw > 0 && sw <= minGapMin ? sp + sw : sp;

  out.push(
    cloneAtomicSegment(slot, slot.dateYmd, normalizeHHmm(slot.timeHHmm), firstPrimaryColumnMin)
  );

  // Inter-phase wait does not consume worker hands for greedy packing — do not emit a separate atomic
  // “wait” segment (other bookings may occupy that wall time).

  if (sf > 0) {
    const fStart = addWallMinutesInTimezone(slot.dateYmd, normalizeHHmm(slot.timeHHmm), sp + sw, siteTz);
    if (fStart) {
      const wid =
        slot.followUpWorkerId != null && String(slot.followUpWorkerId).trim() !== ""
          ? String(slot.followUpWorkerId).trim()
          : slot.workerId;
      const wname = slot.followUpWorkerName ?? slot.workerName ?? null;
      const svc =
        slot.followUpServiceName != null && String(slot.followUpServiceName).trim() !== ""
          ? String(slot.followUpServiceName).trim()
          : slot.serviceName;
      out.push({
        dateYmd: fStart.dateYmd,
        timeHHmm: fStart.timeHHmm,
        workerId: wid?.trim() ? wid : null,
        workerName: wname,
        serviceTypeId: null,
        serviceId: null,
        serviceName: svc,
        durationMin: sf,
        primaryDurationMin: sf,
        waitMinutes: 0,
        followUpDurationMin: 0,
        followUpWorkerId: null,
        followUpWorkerName: null,
        followUpServiceName: null,
      });
    }
  }

  return sortFreedSlotsByWallTime(out, siteTz);
}

/** Wall intervals this entry consumes when booked against `capacity` (primary start = capacity start). */
export function wallOccupanciesFromEntryAndCapacity(
  entry: Pick<BookingWaitlistEntry, "primaryDurationMin" | "waitMinutes" | "followUpDurationMin">,
  capacity: FreedBookingSlot,
  siteTz: string
): WallOccupancy[] {
  const ep = Math.max(1, Math.round(Number(entry.primaryDurationMin ?? 60)));
  const ew = Math.max(0, Math.round(Number(entry.waitMinutes ?? 0)));
  const ef = Math.max(0, Math.round(Number(entry.followUpDurationMin ?? 0)));

  const occ: WallOccupancy[] = [
    {
      dateYmd: capacity.dateYmd,
      timeHHmm: normalizeHHmm(capacity.timeHHmm),
      workerId: capacity.workerId,
      durationMin: ep,
    },
  ];

  if (ef > 0) {
    const p2 = addWallMinutesInTimezone(capacity.dateYmd, normalizeHHmm(capacity.timeHHmm), ep + ew, siteTz);
    if (p2) {
      const wid =
        capacity.followUpWorkerId != null && String(capacity.followUpWorkerId).trim() !== ""
          ? String(capacity.followUpWorkerId).trim()
          : capacity.workerId;
      occ.push({ dateYmd: p2.dateYmd, timeHHmm: p2.timeHHmm, workerId: wid, durationMin: ef });
    }
  }

  return occ;
}

function subtractOneOccFromSegment(
  seg: FreedBookingSlot,
  occ: WallOccupancy,
  siteTz: string,
  minKeepMin: number
): FreedBookingSlot[] {
  const wOcc = occ.workerId?.trim() || "";
  const wSeg = seg.workerId?.trim() || "";
  if (wOcc !== wSeg) return [seg];

  const oDur = Math.max(0, Math.round(Number(occ.durationMin ?? 0)));
  if (oDur <= 0) return [seg];

  const s0 = wallInstantMs(seg.dateYmd, seg.timeHHmm, siteTz);
  const o0 = wallInstantMs(occ.dateYmd, occ.timeHHmm, siteTz);
  if (s0 == null || o0 == null) return [seg];

  const segDurMin = segmentDurationMin(seg);
  const s1 = s0 + segDurMin * 60_000;
  const o1 = o0 + oDur * 60_000;

  const ovStart = Math.max(s0, o0);
  const ovEnd = Math.min(s1, o1);
  if (ovEnd <= ovStart) return [seg];

  const res: FreedBookingSlot[] = [];

  const leftMin = Math.round((ovStart - s0) / 60_000);
  if (leftMin > minKeepMin) {
    res.push(cloneAtomicSegment(seg, seg.dateYmd, normalizeHHmm(seg.timeHHmm), leftMin));
  }

  const rightMin = Math.round((s1 - ovEnd) / 60_000);
  if (rightMin > minKeepMin) {
    const fromStartMin = Math.round((ovEnd - s0) / 60_000);
    const wall = addWallMinutesInTimezone(seg.dateYmd, normalizeHHmm(seg.timeHHmm), fromStartMin, siteTz);
    if (wall) res.push(cloneAtomicSegment(seg, wall.dateYmd, wall.timeHHmm, rightMin));
  }

  return res;
}

/** Remove occupied wall time from atomic segments (possibly splitting a segment). */
export function applyWallOccupanciesToAtomicSegments(
  segments: FreedBookingSlot[],
  occupancies: WallOccupancy[],
  siteTz: string,
  minKeepMin: number
): FreedBookingSlot[] {
  let segs = segments;
  for (const occ of occupancies) {
    const next: FreedBookingSlot[] = [];
    for (const seg of segs) {
      next.push(...subtractOneOccFromSegment(seg, occ, siteTz, minKeepMin));
    }
    segs = sortFreedSlotsByWallTime(next, siteTz);
  }
  return segs.filter((s) => segmentDurationMin(s) > minKeepMin);
}

/**
 * Build the persisted offer from the waitlist row's requested footprint, anchored to the matched capacity slice.
 */
export function waitlistOfferFromEntryAgainstCapacity(
  entry: Pick<
    BookingWaitlistEntry,
    "primaryDurationMin" | "waitMinutes" | "followUpDurationMin" | "serviceName"
  >,
  capacity: FreedBookingSlot
): BookingWaitlistOfferSlot {
  const ep = Math.max(1, Math.round(Number(entry.primaryDurationMin ?? 60)));
  const ew = Math.max(0, Math.round(Number(entry.waitMinutes ?? 0)));
  const ef = Math.max(0, Math.round(Number(entry.followUpDurationMin ?? 0)));

  const followUpWorkerId =
    ef > 0
      ? capacity.followUpWorkerId != null && String(capacity.followUpWorkerId).trim() !== ""
        ? String(capacity.followUpWorkerId).trim()
        : capacity.workerId
      : null;

  const primarySvc = entry.serviceName?.trim() || capacity.serviceName;
  const followSvc =
    ef > 0
      ? capacity.followUpServiceName?.trim() || capacity.serviceName
      : undefined;

  return {
    dateYmd: capacity.dateYmd,
    timeHHmm: normalizeHHmm(capacity.timeHHmm),
    workerId: capacity.workerId,
    workerName: capacity.workerName ?? null,
    durationMin: ep,
    primaryDurationMin: ep,
    serviceName: primarySvc,
    waitMinutes: ew,
    followUpDurationMin: ef,
    followUpWorkerId,
    followUpWorkerName:
      ef > 0 ? capacity.followUpWorkerName ?? capacity.workerName ?? null : null,
    followUpServiceName: ef > 0 ? followSvc ?? null : null,
  };
}

export function offerSlotToFreedSlot(offer: BookingWaitlistOfferSlot): FreedBookingSlot {
  const primaryDurationMin = Math.max(
    1,
    Math.round(Number(offer.primaryDurationMin ?? offer.durationMin ?? 60))
  );
  return {
    dateYmd: offer.dateYmd,
    timeHHmm: offer.timeHHmm,
    workerId: offer.workerId,
    workerName: offer.workerName ?? null,
    serviceTypeId: null,
    serviceId: null,
    serviceName: offer.serviceName,
    durationMin: primaryDurationMin,
    primaryDurationMin,
    waitMinutes: Math.max(0, Math.round(Number(offer.waitMinutes ?? 0))),
    followUpDurationMin: Math.max(0, Math.round(Number(offer.followUpDurationMin ?? 0))),
    followUpWorkerId:
      offer.followUpWorkerId != null && String(offer.followUpWorkerId).trim() !== ""
        ? String(offer.followUpWorkerId).trim()
        : null,
    followUpWorkerName: offer.followUpWorkerName ?? null,
    followUpServiceName: offer.followUpServiceName ?? null,
  };
}
