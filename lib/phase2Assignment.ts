/**
 * Phase 2 (follow-up) worker assignment: single source of truth.
 * Used when calculating availability (hide invalid phase 1 options) and when creating the booking.
 * No user selection — system auto-assigns.
 *
 * Rule: Prefer same worker. Assign phase 2 to the phase 1 worker if they can do phase 2 and are
 * available at the phase 2 time. Only assign a different worker when the phase 1 worker cannot
 * do phase 2 or is not available.
 */

import { canWorkerPerformService } from "./workerServiceCompatibility";
import { getWorkerBusyIntervals, overlaps } from "./bookingPhases";
import { slotOverlapsBreaks } from "./breaks";
import type { BookingLike } from "./bookingPhases";

export interface WorkerForPhase2 {
  id: string;
  name: string;
  services?: string[];
  active?: boolean;
  availability?: unknown[];
}

export interface GetEligiblePhase2WorkersParams {
  dateStr: string;
  phase1StartMinutes: number;
  phase1DurationMin: number;
  waitMin: number;
  phase2DurationMin: number;
  phase2ServiceName: string;
  /** Prefer for eligibility (Workers page stores service IDs). */
  phase2ServiceId?: string | null;
  workers: WorkerForPhase2[];
  bookingsForDate: Array<BookingLike & { status?: string }>;
  workerWindowByWorkerId?: Record<string, { startMin: number; endMin: number } | null>;
  businessWindow?: { startMin: number; endMin: number } | null;
  /** Worker-specific breaks for this day; phase 2 segment must not overlap worker's break. */
  workerBreaksByWorkerId?: Record<string, { start: string; end: string }[] | undefined>;
}

/**
 * Returns workers who can perform the phase 2 service and are available during the phase 2 time window.
 * Used to gate phase 1 options (hide slot if length === 0) and to auto-assign phase 2 worker on submit.
 */
export function getEligiblePhase2Workers(params: GetEligiblePhase2WorkersParams): WorkerForPhase2[] {
  const {
    dateStr,
    phase1StartMinutes,
    phase1DurationMin,
    waitMin,
    phase2DurationMin,
    phase2ServiceName,
    phase2ServiceId,
    workers,
    bookingsForDate,
    workerWindowByWorkerId,
    businessWindow,
    workerBreaksByWorkerId,
  } = params;

  const phase2StartMin = phase1StartMinutes + phase1DurationMin + waitMin;
  const phase2EndMin = phase2StartMin + phase2DurationMin;
  const phase2NameTrim = (phase2ServiceName && String(phase2ServiceName).trim()) ? String(phase2ServiceName).trim() : "";
  const phase2IdTrim = (phase2ServiceId && String(phase2ServiceId).trim()) ? String(phase2ServiceId).trim() : null;
  const serviceIdentifier = phase2NameTrim || phase2IdTrim || "";

  function collectEligible(identifier: string): WorkerForPhase2[] {
    const out: WorkerForPhase2[] = [];
    for (const worker of workers) {
      if (!canWorkerPerformService(worker, identifier)) continue;
      const busyIntervals = getWorkerBusyIntervals(bookingsForDate, worker.id, dateStr);
      const hasConflict = busyIntervals.some((interval) =>
        overlaps(phase2StartMin, phase2EndMin, interval.startMin, interval.endMin)
      );
      if (hasConflict) continue;
      if (workerWindowByWorkerId) {
        const window = workerWindowByWorkerId[worker.id];
        if (window) {
          const effectiveStart = businessWindow
            ? Math.max(window.startMin, businessWindow.startMin)
            : window.startMin;
          const effectiveEnd = businessWindow
            ? Math.min(window.endMin, businessWindow.endMin)
            : window.endMin;
          if (effectiveEnd <= effectiveStart) continue;
          if (phase2StartMin < effectiveStart || phase2EndMin > effectiveEnd) continue;
        }
      }
      if (workerBreaksByWorkerId?.[worker.id]?.length && slotOverlapsBreaks(phase2StartMin, phase2EndMin, workerBreaksByWorkerId[worker.id])) continue;
      out.push(worker);
    }
    return out;
  }

  let eligible = collectEligible(phase2NameTrim);
  if (eligible.length === 0 && phase2IdTrim && phase2IdTrim !== phase2NameTrim) {
    eligible = collectEligible(phase2IdTrim);
  }
  return eligible;
}

/**
 * Deterministic auto-assignment: least busy (fewest busy intervals that day) then by worker.id.
 * Returns the worker to assign to phase 2, or null if none eligible.
 */
export function autoAssignPhase2Worker(
  eligibleWorkers: WorkerForPhase2[],
  options: {
    dateStr: string;
    bookingsForDate: Array<BookingLike & { status?: string }>;
  }
): { id: string; name: string } | null {
  if (eligibleWorkers.length === 0) return null;
  if (eligibleWorkers.length === 1) {
    const w = eligibleWorkers[0];
    return { id: w.id, name: w.name };
  }

  const { dateStr, bookingsForDate } = options;
  const busyCountByWorkerId: Record<string, number> = {};
  for (const w of eligibleWorkers) {
    const intervals = getWorkerBusyIntervals(bookingsForDate, w.id, dateStr);
    busyCountByWorkerId[w.id] = intervals.length;
  }

  const sorted = [...eligibleWorkers].sort((a, b) => {
    const countA = busyCountByWorkerId[a.id] ?? 0;
    const countB = busyCountByWorkerId[b.id] ?? 0;
    if (countA !== countB) return countA - countB;
    return a.id.localeCompare(b.id);
  });

  const first = sorted[0];
  return first ? { id: first.id, name: first.name } : null;
}

export interface ResolvePhase2WorkerParams {
  phase1Worker: { id: string; name: string };
  preferredWorkerId?: string | null;
  dateStr: string;
  phase1StartMinutes: number;
  phase1DurationMin: number;
  waitMin: number;
  phase2DurationMin: number;
  phase2ServiceName: string;
  phase2ServiceId?: string | null;
  workers: WorkerForPhase2[];
  bookingsForDate: Array<BookingLike & { status?: string }>;
  workerWindowByWorkerId?: Record<string, { startMin: number; endMin: number } | null>;
  businessWindow?: { startMin: number; endMin: number } | null;
  workerBreaksByWorkerId?: Record<string, { start: string; end: string }[] | undefined>;
}

/**
 * Resolve which worker should perform phase 2. Single function used for availability and booking.
 * - If phase 1 worker can do phase 2 service AND is available at phase 2 time → return phase 1 worker.
 * - Else if another worker is eligible and available → return one (deterministic: least busy, then by id).
 * - Else return null (do not show this option / cannot complete booking).
 */
export function resolvePhase2Worker(params: ResolvePhase2WorkerParams): { id: string; name: string } | null {
  const {
    phase1Worker,
    preferredWorkerId,
    dateStr,
    phase1StartMinutes,
    phase1DurationMin,
    waitMin,
    phase2DurationMin,
    phase2ServiceName,
    phase2ServiceId,
    workers,
    bookingsForDate,
    workerWindowByWorkerId,
    businessWindow,
    workerBreaksByWorkerId,
  } = params;

  const eligible = getEligiblePhase2Workers({
    dateStr,
    phase1StartMinutes,
    phase1DurationMin,
    waitMin,
    phase2DurationMin,
    phase2ServiceName,
    phase2ServiceId: phase2ServiceId ?? undefined,
    workers,
    bookingsForDate,
    workerWindowByWorkerId,
    businessWindow,
    workerBreaksByWorkerId,
  });

  if (preferredWorkerId && eligible.some((w) => w.id === preferredWorkerId)) {
    return { id: preferredWorkerId, name: workers.find((w) => w.id === preferredWorkerId)?.name ?? preferredWorkerId };
  }
  const phase1IsEligible = eligible.some((w) => w.id === phase1Worker.id);
  if (phase1IsEligible) {
    return { id: phase1Worker.id, name: phase1Worker.name };
  }

  if (eligible.length === 0) return null;
  return autoAssignPhase2Worker(eligible, { dateStr, bookingsForDate });
}
