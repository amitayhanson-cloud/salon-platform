/**
 * Multi-phase booking: primary duration, optional wait (non-blocking), optional secondary duration.
 * Waiting time does not block workers or client.
 */

import { Timestamp } from "firebase/firestore";

export type PhaseKind = "primary" | "wait" | "secondary";

export interface BookingPhaseInput {
  kind: PhaseKind;
  startAt: Date;
  endAt: Date;
  durationMin: number;
  workerId?: string | null;
  workerName?: string | null;
  serviceTypeId?: string;
  serviceName?: string;
  serviceType?: string | null;
  serviceColor?: string;
  pricingItemId?: string | null;
  label?: string | null;
}

/** Phase as stored in Firestore (startAt/endAt as Timestamp) */
export interface BookingPhaseDoc {
  kind: PhaseKind;
  startAt: Timestamp;
  endAt: Timestamp;
  durationMin: number;
  workerId?: string | null;
  workerName?: string | null;
  serviceTypeId?: string;
  serviceName?: string;
  serviceColor?: string;
}

export interface ComputePhasesInput {
  startAt: Date;
  primaryWorker: { id: string; name: string };
  secondaryWorker?: { id: string; name: string } | null;
  durationMin: number;
  waitMin?: number;
  secondaryDurationMin?: number;
  /** Primary phase display (phase 1) */
  serviceTypeId?: string;
  serviceName?: string;
  serviceType?: string | null;
  serviceColor?: string;
  pricingItemId?: string | null;
  /** Secondary phase display (phase 2 – follow-up service) */
  secondaryServiceTypeId?: string | null;
  secondaryServiceName?: string;
  secondaryServiceType?: string | null;
  secondaryServiceColor?: string;
  secondaryPricingItemId?: string | null;
}

/**
 * Compute phases array for a multi-phase booking.
 * primary: [startAt, startAt + durationMin], worker = primaryWorker, display from primary service
 * wait: [end(primary), end(primary) + waitMin], workerId = null (not stored)
 * secondary (if secondaryDurationMin > 0): starts at end(wait), worker = secondaryWorker ?? primaryWorker, display from follow-up service
 */
export function computeBookingPhases(input: ComputePhasesInput): BookingPhaseInput[] {
  const {
    startAt,
    primaryWorker,
    secondaryWorker,
    durationMin,
    waitMin = 0,
    secondaryDurationMin = 0,
    serviceTypeId,
    serviceName,
    serviceType,
    serviceColor,
    pricingItemId,
    secondaryServiceTypeId,
    secondaryServiceName,
    secondaryServiceType,
    secondaryServiceColor,
    secondaryPricingItemId,
  } = input;

  const phases: BookingPhaseInput[] = [];
  let cursor = new Date(startAt.getTime());

  // Primary phase: primary service display
  const primaryEnd = new Date(cursor.getTime() + durationMin * 60 * 1000);
  phases.push({
    kind: "primary",
    startAt: new Date(cursor.getTime()),
    endAt: primaryEnd,
    durationMin,
    workerId: primaryWorker.id,
    workerName: primaryWorker.name,
    serviceTypeId,
    serviceName,
    serviceType,
    serviceColor,
    pricingItemId,
  });
  cursor = primaryEnd;

  // Wait (non-blocking) – not stored in phases
  if (waitMin > 0) {
    const waitEnd = new Date(cursor.getTime() + waitMin * 60 * 1000);
    phases.push({
      kind: "wait",
      startAt: new Date(cursor.getTime()),
      endAt: waitEnd,
      durationMin: waitMin,
      workerId: null,
      workerName: null,
    });
    cursor = waitEnd;
  }

  // Secondary phase: follow-up service display (only if we have secondary duration and optionally secondary service info)
  if (secondaryDurationMin > 0) {
    const worker = secondaryWorker ?? primaryWorker;
    const secondaryEnd = new Date(cursor.getTime() + secondaryDurationMin * 60 * 1000);
    phases.push({
      kind: "secondary",
      startAt: new Date(cursor.getTime()),
      endAt: secondaryEnd,
      durationMin: secondaryDurationMin,
      workerId: worker.id,
      workerName: worker.name,
      serviceTypeId: secondaryServiceTypeId ?? undefined,
      serviceName: secondaryServiceName,
      serviceType: secondaryServiceType,
      serviceColor: secondaryServiceColor,
      pricingItemId: secondaryPricingItemId ?? undefined,
    });
  }

  return phases;
}

/** Firestore phases array: only blocking phases (1 and 2). Wait is NOT stored. Each phase includes display fields. */
export interface BookingPhaseDocStored {
  phase: 1 | 2;
  workerId: string;
  startAt: Timestamp;
  endAt: Timestamp;
  durationMin: number;
  serviceTypeId?: string | null;
  serviceName?: string | null;
  serviceType?: string | null;
  serviceColor?: string | null;
  pricingItemId?: string | null;
  label?: string | null;
}

/** Convert computed phases to Firestore shape: only phase 1 and phase 2 (no wait), with phase-specific display fields. */
export function phasesToStored(phases: BookingPhaseInput[]): BookingPhaseDocStored[] {
  return phases
    .filter((p) => p.kind === "primary" || p.kind === "secondary")
    .map((p) => ({
      phase: (p.kind === "primary" ? 1 : 2) as 1 | 2,
      workerId: p.workerId ?? "",
      startAt: Timestamp.fromDate(p.startAt),
      endAt: Timestamp.fromDate(p.endAt),
      durationMin: p.durationMin,
      serviceTypeId: p.serviceTypeId ?? null,
      serviceName: p.serviceName ?? null,
      serviceType: p.serviceType ?? null,
      serviceColor: p.serviceColor ?? null,
      pricingItemId: p.pricingItemId ?? null,
      label: p.label ?? null,
    }));
}

/** Convert phase to Firestore shape (Date -> Timestamp) - legacy full shape */
export function phasesToDoc(phases: BookingPhaseInput[]): BookingPhaseDoc[] {
  return phases.map((p) => ({
    kind: p.kind,
    startAt: Timestamp.fromDate(p.startAt),
    endAt: Timestamp.fromDate(p.endAt),
    durationMin: p.durationMin,
    workerId: p.workerId ?? null,
    workerName: p.workerName ?? null,
    serviceTypeId: p.serviceTypeId,
    serviceName: p.serviceName,
    serviceColor: p.serviceColor,
  }));
}

export interface BusyInterval {
  startMin: number; // minutes from midnight (local day)
  endMin: number;
  /** For debug: which booking this interval came from */
  bookingId?: string;
}

/**
 * Get busy intervals for a worker from bookings. Uses only phase 1 and phase 2 windows;
 * wait gap is never a busy interval. Builds from toPhaseEvents(booking) for each booking.
 */
export function getWorkerBusyIntervals(
  bookings: Array<BookingLike & { status?: string }>,
  workerId: string,
  dateStr: string // YYYY-MM-DD for same-day minutes
): BusyInterval[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);

  const intervals: BusyInterval[] = [];

  for (const b of bookings) {
    const status = (b.status ?? "").toLowerCase();
    if (status === "cancelled" || status === "canceled") continue;

    const events = toPhaseEvents(b);
    for (const event of events) {
      if (event.workerId !== workerId) continue;
      const startMin = (event.startAt.getTime() - dayStart.getTime()) / (60 * 1000);
      const endMin = (event.endAt.getTime() - dayStart.getTime()) / (60 * 1000);
      intervals.push({ startMin, endMin, bookingId: event.bookingId });
    }
  }

  return intervals;
}

/**
 * Returns the first busy interval that overlaps the slot, or null. For debug logging when a slot is rejected.
 */
export function getConflictingBusyInterval(
  bookings: Array<BookingLike & { status?: string }>,
  workerId: string,
  dateStr: string,
  slotStartMin: number,
  slotEndMin: number
): (BusyInterval & { bookingId?: string }) | null {
  const intervals = getWorkerBusyIntervals(bookings, workerId, dateStr);
  const iv = intervals.find((i) => overlaps(slotStartMin, slotEndMin, i.startMin, i.endMin));
  return iv ?? null;
}

/** Standard overlap: (aStart, aEnd) overlaps (bStart, bEnd) */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ---------------------------------------------------------------------------
// Phase events for DAILY calendar view (primary + secondary only; wait never blocks)
// ---------------------------------------------------------------------------

export type BookingPhaseEvent = {
  id: string; // `${bookingId}:1` or `${bookingId}:2`
  bookingId: string;
  phase: 1 | 2;
  workerId: string;
  clientId?: string;
  clientName: string;
  serviceName: string;
  startAt: Date;
  endAt: Date;
  status: string;
  color?: string;
  isSecondary?: boolean;
};

/** One phase in Firestore or normalized (phase 1 or 2 only; no wait) */
export type StoredPhaseLike = {
  phase?: 1 | 2;
  kind?: string;
  startAt: Date | { toDate: () => Date };
  endAt: Date | { toDate: () => Date };
  durationMin: number;
  workerId?: string | null;
  serviceTypeId?: string | null;
  serviceName?: string | null;
  serviceType?: string | null;
  serviceColor?: string | null;
  pricingItemId?: string | null;
  label?: string | null;
};

export type BookingLike = {
  id: string;
  workerId?: string | null;
  secondaryWorkerId?: string | null;
  secondaryWorkerName?: string | null;
  date?: string;
  time?: string;
  timeHHmm?: string;
  durationMin?: number;
  primaryDurationMin?: number;
  waitMin?: number;
  waitMinutes?: number;
  secondaryDurationMin?: number;
  hasSecondary?: boolean;
  customerName?: string;
  clientName?: string;
  serviceName?: string;
  status?: string;
  serviceColor?: string | null;
  clientId?: string;
  /** 1 = phase 1 (main), 2 = phase 2 (follow-up); each booking doc is one block */
  phase?: 1 | 2;
  /** Set on phase 2 doc; links to phase 1 booking id */
  parentBookingId?: string | null;
  startAt?: Date | { toDate: () => Date; toMillis?: () => number };
  endAt?: Date | { toDate: () => Date; toMillis?: () => number };
  start?: Date | { toDate: () => Date };
  end?: Date | { toDate: () => Date };
  followUpStartAt?: Date | { toDate: () => Date };
  followUpEndAt?: Date | { toDate: () => Date };
  followUpWorkerId?: string | null;
  followUpServiceId?: string | null;
  secondaryStartAt?: Date | { toDate: () => Date; toMillis?: () => number };
  secondaryEndAt?: Date | { toDate: () => Date; toMillis?: () => number };
  phases?: StoredPhaseLike[];
};

function toDate(val: Date | { toDate: () => Date } | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof (val as { toDate: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
  return null;
}

/** Returns wait duration in minutes. Uses waitMin (canonical) then waitMinutes (legacy); safe narrowing. */
function getWaitMin(booking: { waitMin?: number; waitMinutes?: number }): number {
  const w = booking.waitMin;
  if (typeof w === "number" && Number.isFinite(w) && w >= 0) return Math.floor(w);
  const wm = booking.waitMinutes;
  if (typeof wm === "number" && Number.isFinite(wm) && wm >= 0) return Math.floor(wm);
  return 0;
}

/**
 * Build phase events from booking.phases (phase 1 and 2 only). Used when phases array exists.
 * Supports both { phase: 1|2 } and legacy { kind: "primary"|"secondary" }.
 * Block id is unique per phase: ${bookingId}:phase:${phase}.
 * Phase 2 uses phase-specific serviceName/serviceColor; fallback to parent for backwards compatibility.
 */
function phaseEventsFromPhasesArray(booking: BookingLike): BookingPhaseEvent[] | null {
  if (!booking.phases || !Array.isArray(booking.phases) || booking.phases.length === 0) return null;
  const clientName = booking.customerName ?? booking.clientName ?? "—";
  const parentServiceName = booking.serviceName ?? "—";
  const parentColor = booking.serviceColor ?? undefined;
  const status = booking.status ?? "confirmed";
  const events: BookingPhaseEvent[] = [];
  for (const p of booking.phases) {
    const phaseNum = (p as { phase?: number }).phase ?? ((p as { kind?: string }).kind === "secondary" ? 2 : (p as { kind?: string }).kind === "primary" ? 1 : null);
    if (phaseNum !== 1 && phaseNum !== 2) continue;
    const workerId = p.workerId ?? booking.workerId;
    if (!workerId) continue;
    const startAt = toDate(p.startAt);
    const endAt = toDate(p.endAt);
    if (!startAt || !endAt) continue;
    const phaseServiceName = (p as StoredPhaseLike).serviceName ?? parentServiceName;
    const phaseColor = (p as StoredPhaseLike).serviceColor ?? parentColor;
    events.push({
      id: `${booking.id}:phase:${phaseNum}`,
      bookingId: booking.id,
      phase: phaseNum,
      workerId,
      clientId: booking.clientId,
      clientName,
      serviceName: phaseServiceName,
      startAt,
      endAt,
      status,
      color: phaseColor ?? undefined,
      isSecondary: phaseNum === 2,
    });
  }
  return events.length > 0 ? events : null;
}

/**
 * Build phase events for a single booking. Used for busy intervals and legacy views.
 * Prefers flat follow-up fields (followUpStartAt/followUpEndAt) when present, then booking.phases, then derived.
 * Wait gap is never a busy interval / never rendered.
 */
export function toPhaseEvents(booking: BookingLike): BookingPhaseEvent[] {
  const clientName = booking.customerName ?? booking.clientName ?? "—";
  const status = booking.status ?? "confirmed";
  const color = booking.serviceColor ?? undefined;
  const mainStart = toDate(booking.start ?? booking.startAt);
  const mainEnd = toDate(booking.end ?? booking.endAt);
  const followUpStart = toDate(booking.followUpStartAt);
  const followUpEnd = toDate(booking.followUpEndAt);
  const workerId = booking.workerId ?? "";
  // One booking doc = one interval (phase 1 and phase 2 are separate docs now)
  if (mainStart && mainEnd && workerId) {
    const phase = booking.phase ?? 1;
    const serviceName = booking.serviceName ?? "—";
    return [
      {
        id: booking.id,
        bookingId: booking.id,
        phase: (phase === 2 ? 2 : 1) as 1 | 2,
        workerId,
        clientId: booking.clientId,
        clientName,
        serviceName,
        startAt: mainStart,
        endAt: mainEnd,
        status,
        color,
        isSecondary: phase === 2,
      },
    ];
  }
  const fromPhases = phaseEventsFromPhasesArray(booking);
  if (fromPhases) return fromPhases;

  const events: BookingPhaseEvent[] = [];
  const legClientName = booking.customerName ?? booking.clientName ?? "—";
  const legServiceName = booking.serviceName ?? "—";
  const legStatus = booking.status ?? "confirmed";
  const legColor = booking.serviceColor ?? undefined;

  const phase1Start = toDate(booking.startAt) ?? (() => {
    const dateStr = (booking as { date?: string }).date ?? "";
    const timeStr = (booking as { timeHHmm?: string }).timeHHmm ?? booking.time ?? "";
    if (!dateStr || !timeStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  })();
  if (!phase1Start) return events;

  const durationMin = booking.primaryDurationMin ?? booking.durationMin ?? 60;
  const primaryWorkerId = booking.workerId ?? null;
  if (!primaryWorkerId) return events;

  const phase1EndDate = toDate(booking.endAt) ?? new Date(phase1Start.getTime() + durationMin * 60 * 1000);
  events.push({
    id: `${booking.id}:phase:1`,
    bookingId: booking.id,
    phase: 1,
    workerId: primaryWorkerId,
    clientId: booking.clientId,
    clientName: legClientName,
    serviceName: legServiceName,
    startAt: new Date(phase1Start.getTime()),
    endAt: phase1EndDate,
    status: legStatus,
    color: legColor,
    isSecondary: false,
  });

  const secondaryDurationMin = booking.secondaryDurationMin ?? 0;
  if (secondaryDurationMin <= 0) return events;

  const secondaryStartAt = toDate(booking.secondaryStartAt);
  const secondaryEndAt = toDate(booking.secondaryEndAt);
  let phase2Start: Date;
  let phase2End: Date;

  if (secondaryStartAt && secondaryEndAt) {
    phase2Start = secondaryStartAt;
    phase2End = secondaryEndAt;
  } else {
    const waitMin = getWaitMin(booking);
    const phase1DurationMin = booking.primaryDurationMin ?? booking.durationMin ?? 60;
    const phase1End = new Date(phase1Start.getTime() + phase1DurationMin * 60 * 1000);
    phase2Start = new Date(phase1End.getTime() + waitMin * 60 * 1000);
    phase2End = new Date(phase2Start.getTime() + secondaryDurationMin * 60 * 1000);
  }

  const secondaryWorkerId = booking.secondaryWorkerId ?? booking.workerId;
  if (secondaryWorkerId && phase2Start && phase2End) {
    events.push({
      id: `${booking.id}:phase:2`,
      bookingId: booking.id,
      phase: 2,
      workerId: secondaryWorkerId,
      clientId: booking.clientId,
      clientName: legClientName,
      serviceName: legServiceName,
      startAt: phase2Start,
      endAt: phase2End,
      status: legStatus,
      color: legColor,
      isSecondary: true,
    });
  }

  return events;
}

/** Alias; daily views use toPhaseEvents. */
export function toBookingPhaseEvents(booking: BookingLike): BookingPhaseEvent[] {
  return toPhaseEvents(booking);
}
