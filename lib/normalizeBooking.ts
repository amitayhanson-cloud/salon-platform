/**
 * Normalize a Firestore booking doc to a consistent shape for the admin calendar.
 * Use dateStr/timeHHmm (string day key) for day matching—do not derive day from startAt (timezone shifts hide bookings).
 */

import { computePhases } from "./bookingPhasesTiming";

const DEBUG_GAP = false;

/** Phase as returned from Firestore (phase 1|2 only; startAt/endAt may be Timestamp) */
export interface NormalizedPhase {
  phase?: 1 | 2;
  kind?: "primary" | "wait" | "secondary";
  startAt: Date | { toDate: () => Date };
  endAt: Date | { toDate: () => Date };
  durationMin: number;
  workerId?: string | null;
  workerName?: string | null;
  serviceTypeId?: string;
  serviceName?: string;
  serviceColor?: string;
}

export interface NormalizedBooking {
  id: string;
  dateStr: string;
  timeHHmm: string;
  start: Date | null;
  end: Date | null;
  workerId: string | null;
  status: string;
  durationMin: number;
  phases: NormalizedPhase[];
  /** 1 = phase 1 (main), 2 = phase 2 (follow-up); each booking doc is one block */
  phase?: 1 | 2;
  /** Set on phase 2 booking doc; links to phase 1 booking id */
  parentBookingId?: string | null;
  primaryWorkerId?: string | null;
  secondaryWorkerId?: string | null;
  primaryDurationMin?: number;
  waitMin?: number;
  secondaryDurationMin?: number;
  followUpStartAt?: Date | null;
  followUpEndAt?: Date | null;
  followUpServiceId?: string | null;
  followUpDurationMinutes?: number;
  followUpWorkerId?: string | null;
  waitMinutes?: number;
  [key: string]: unknown;
}

type FirestoreDoc = { id: string; data: () => Record<string, unknown> };

function toDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate();
  return null;
}

/**
 * Normalize a booking document from Firestore for consistent use in rendering.
 * phases is always set: from doc.phases when present, else derived from start/end + secondary.
 */
export function normalizeBooking(doc: FirestoreDoc): NormalizedBooking {
  const d = doc.data();
  const dateStr = (d.dateISO ?? d.date ?? "") as string;
  const timeHHmm = (d.timeHHmm ?? d.time ?? "") as string;
  const startAt = d.startAt as { toDate?: () => Date } | undefined;
  const endAt = d.endAt as { toDate?: () => Date } | undefined;

  const durationMin = (d.durationMin as number) ?? (d.duration as number) ?? 60;
  const rawPhases = d.phases as Array<{ phase?: number; kind?: string; startAt?: unknown; endAt?: unknown; durationMin?: number; workerId?: string; serviceName?: string; serviceType?: string; serviceColor?: string; serviceTypeId?: string }> | undefined;
  const parentServiceName = (d.serviceName as string) ?? "";
  const parentServiceColor = (d.serviceColor as string) ?? undefined;
  const primaryDurationMin = typeof d.primaryDurationMin === "number" ? d.primaryDurationMin : durationMin;
  const waitMin = typeof d.waitMin === "number" ? d.waitMin : 0;
  const secondaryDurationMin = typeof d.secondaryDurationMin === "number" ? d.secondaryDurationMin : 0;
  const secondaryStartAtRaw = d.secondaryStartAt as { toDate?: () => Date } | undefined;
  const secondaryEndAtRaw = d.secondaryEndAt as { toDate?: () => Date } | undefined;
  const followUpStartAtRaw = d.followUpStartAt as { toDate?: () => Date } | undefined;
  const followUpEndAtRaw = d.followUpEndAt as { toDate?: () => Date } | undefined;

  const startDate = toDateSafe(startAt) ?? null;
  const endDate = toDateSafe(endAt) ?? null;
  const secondaryStartDate = toDateSafe(secondaryStartAtRaw) ?? null;
  const secondaryEndDate = toDateSafe(secondaryEndAtRaw) ?? null;
  const followUpStartDate = toDateSafe(followUpStartAtRaw) ?? null;
  const followUpEndDate = toDateSafe(followUpEndAtRaw) ?? null;
  const workerId = (d.workerId as string | null) ?? null;
  const secondaryWorkerId = (d.secondaryWorkerId as string | null) ?? null;
  const followUpWorkerId = (d.followUpWorkerId as string | null) ?? null;
  const waitMinutes = typeof d.waitMinutes === "number" ? d.waitMinutes : waitMin;
  const followUpServiceId = (d.followUpServiceId as string | null) ?? null;
  const followUpDurationMinutes = typeof d.followUpDurationMinutes === "number" ? d.followUpDurationMinutes : 0;
  const phase = d.phase === 2 ? 2 : (d.phase === 1 ? 1 : undefined);
  const parentBookingId = (d.parentBookingId as string | null) ?? null;

  let phases: NormalizedPhase[];
  if (Array.isArray(rawPhases) && rawPhases.length > 0) {
    phases = rawPhases.map((p) => {
      const phaseNum = p.phase ?? (p.kind === "secondary" ? 2 : 1);
      return {
        phase: (phaseNum === 2 ? 2 : 1) as 1 | 2,
        kind: phaseNum === 2 ? "secondary" : "primary",
        startAt: toDateSafe(p.startAt) ?? new Date(0),
        endAt: toDateSafe(p.endAt) ?? new Date(0),
        durationMin: typeof p.durationMin === "number" ? p.durationMin : 0,
        workerId: p.workerId ?? null,
        serviceName: p.serviceName ?? parentServiceName,
        serviceType: p.serviceType ?? (d.serviceType as string) ?? undefined,
        serviceColor: p.serviceColor ?? parentServiceColor,
        serviceTypeId: p.serviceTypeId ?? undefined,
      } as NormalizedPhase;
    });
  } else {
    phases = [];
    if (startDate && endDate && workerId) {
      phases.push({
        phase: 1,
        kind: "primary",
        startAt: startDate,
        endAt: endDate,
        durationMin: primaryDurationMin,
        workerId,
      } as NormalizedPhase);
    }
    if (secondaryDurationMin > 0) {
      let secStart: Date | null;
      let secEnd: Date | null;
      if (secondaryStartDate && secondaryEndDate) {
        secStart = secondaryStartDate;
        secEnd = secondaryEndDate;
      } else if (startDate && endDate) {
        const phases = computePhases({
          startAt: startDate,
          durationMinutes: primaryDurationMin,
          waitMinutes: waitMinutes,
          followUpDurationMinutes: secondaryDurationMin,
        });
        secStart = phases.phase2StartAt;
        secEnd = phases.phase2EndAt;
        if (DEBUG_GAP) {
          const phase1End = new Date(startDate.getTime() + primaryDurationMin * 60 * 1000);
          const computedGapMin = Math.round((secStart.getTime() - phase1End.getTime()) / (60 * 1000));
          console.debug("[GAP] normalizeBooking", {
            bookingId: doc.id,
            phase1Start: startDate.toISOString(),
            phase1End: phase1End.toISOString(),
            waitMinutes,
            computedFollowUpStart: secStart.toISOString(),
            computedGapMin,
          });
          if (computedGapMin !== waitMinutes) {
            console.warn("[GAP] computedGapMin must equal waitMinutes", { computedGapMin, waitMinutes });
          }
        }
      } else {
        secStart = null;
        secEnd = null;
      }
      const secWorker = secondaryWorkerId ?? workerId;
      if (secStart && secEnd && secWorker) {
        phases.push({
          phase: 2,
          kind: "secondary",
          startAt: secStart,
          endAt: secEnd,
          durationMin: secondaryDurationMin,
          workerId: secWorker,
        } as NormalizedPhase);
      }
    }
  }

  return {
    ...d,
    id: doc.id,
    dateStr: String(dateStr),
    timeHHmm: String(timeHHmm),
    date: dateStr,
    time: timeHHmm,
    start: startDate,
    end: endDate,
    workerId,
    status: (d.status as string) ?? "confirmed",
    durationMin,
    phases,
    primaryWorkerId: d.primaryWorkerId ?? d.workerId ?? null,
    secondaryWorkerId: d.secondaryWorkerId ?? null,
    primaryDurationMin,
    waitMin,
    secondaryDurationMin,
    secondaryStartAt: secondaryStartDate ?? undefined,
    secondaryEndAt: secondaryEndDate ?? undefined,
    followUpStartAt: followUpStartDate ?? undefined,
    followUpEndAt: followUpEndDate ?? undefined,
    followUpServiceId: followUpServiceId ?? undefined,
    followUpDurationMinutes,
    followUpWorkerId: followUpWorkerId ?? undefined,
    waitMinutes,
    phase,
    parentBookingId: parentBookingId ?? undefined,
  } as NormalizedBooking;
}

/**
 * Only exclude bookings that are explicitly cancelled.
 * Do NOT exclude "confirmed" or missing status.
 */
export function isBookingCancelled(b: { status?: string; cancelled?: boolean }): boolean {
  const s = (b.status ?? "").toLowerCase();
  if (s === "cancelled" || s === "canceled") return true;
  if (b.cancelled === true) return true;
  return false;
}
