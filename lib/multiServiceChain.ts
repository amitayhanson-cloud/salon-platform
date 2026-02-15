/**
 * Multi-service booking chain: compute timing, resolve workers, validate availability.
 * Additive extension — does not change existing single-service or follow-up logic.
 */

import { canWorkerPerformService, workersWhoCanPerformService, workerCanDoService } from "./workerServiceCompatibility";
import { getWorkerBusyIntervals, getConflictingBusyInterval, overlaps } from "./bookingPhases";
import { resolvePhase2Worker } from "./phase2Assignment";
import { anyServiceSegmentOverlapsBreaks, slotOverlapsBreaks, type BreakRange } from "./breaks";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";

export interface ChainServiceInput {
  service: SiteService;
  pricingItem: PricingItem;
  /** When set, this slot (e.g. finishing service) starts after this many minutes after the previous slot ends. Used only for appended finishing service. */
  finishGapBefore?: number;
}

export interface ChainSlot {
  serviceOrder: number;
  serviceName: string;
  /** Service ID for worker eligibility (source of truth: Workers page). Prefer over serviceName. */
  serviceId?: string | null;
  serviceType: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  workerId: string | null;
  workerName: string | null;
  serviceColor?: string | null;
  pricingItemId?: string | null;
  followUp?: {
    serviceName: string;
    serviceId?: string | null;
    durationMin: number;
    waitMin: number;
    startAt: Date;
    endAt: Date;
    workerId: string | null;
    workerName: string | null;
  };
}

/** Key for deduplicating follow-ups: serviceId if present, else normalized name. */
function getFollowUpKey(followUp: { serviceId?: string | null; name: string }): string {
  const id = followUp.serviceId?.trim();
  if (id) return id;
  return (followUp.name || "").trim().toLowerCase();
}

/**
 * Check if a primary service (by name or id) matches a follow-up.
 * Used to avoid auto-adding follow-up when user explicitly selected it as main service.
 */
function primaryMatchesFollowUp(
  service: { name: string; id?: string },
  followUp: { serviceId?: string | null; name: string }
): boolean {
  const svcName = (service.name || "").trim().toLowerCase();
  const svcId = (service.id || "").trim();
  const fuKey = getFollowUpKey(followUp);
  if (svcId && fuKey === svcId) return true;
  if (svcName && fuKey === svcName) return true;
  if ((followUp.name || "").trim().toLowerCase() === svcName) return true;
  return false;
}

export interface ResolveChainWorkersParams {
  chain: ChainServiceInput[];
  startAt: Date;
  dateStr: string;
  workers: Array<{ id: string; name: string; services?: string[]; availability?: unknown[] }>;
  bookingsForDate: Array<{
    id: string;
    workerId?: string | null;
    date?: string;
    dateStr?: string;
    time?: string;
    timeHHmm?: string;
    durationMin?: number;
    phase?: 1 | 2;
    parentBookingId?: string | null;
    status?: string;
    startAt?: Date | { toDate: () => Date };
    endAt?: Date | { toDate: () => Date };
    waitMin?: number;
    waitMinutes?: number;
    secondaryDurationMin?: number;
    secondaryWorkerId?: string | null;
  }>;
  preferredWorkerId?: string | null;
  workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null>;
  businessWindow: { startMin: number; endMin: number } | null;
  /** Worker-specific breaks for this day (key = workerId). Same segment-based logic as business breaks. */
  workerBreaksByWorkerId?: Record<string, BreakRange[] | undefined>;
}

/**
 * Compute total duration of chain. For multi-service (chain.length > 1), deduplicates
 * follow-ups and places them once at the end. Single-service unchanged.
 */
export function getChainTotalDuration(chain: ChainServiceInput[]): number {
  if (chain.length === 0) return 0;
  if (chain.length === 1) {
    const { pricingItem } = chain[0]!;
    let total = pricingItem.durationMaxMinutes ?? pricingItem.durationMinMinutes ?? 30;
    const followUp = pricingItem.hasFollowUp === true ? pricingItem.followUp : null;
    if (followUp && followUp.durationMinutes >= 1) {
      total += (followUp.waitMinutes ?? 0) + followUp.durationMinutes;
    }
    return total;
  }
  let total = 0;
  const hasFinishingService = chain.some((c) => c.finishGapBefore != null);
  for (const item of chain) {
    total += (item.finishGapBefore ?? 0) + (item.pricingItem.durationMaxMinutes ?? item.pricingItem.durationMinMinutes ?? 30);
  }
  if (!hasFinishingService) {
    const deduped = collectDedupedFollowUps(chain);
    for (const fu of deduped) {
      total += (fu.waitMinutes ?? 0) + fu.durationMinutes;
    }
  }
  return total;
}

/** Collect deduplicated follow-ups for multi-service chain. Excludes follow-ups that match a primary. */
function collectDedupedFollowUps(chain: ChainServiceInput[]): Array<{ name: string; serviceId?: string | null; durationMinutes: number; waitMinutes: number }> {
  const seen = new Map<string, { name: string; serviceId?: string | null; durationMinutes: number; waitMinutes: number }>();
  const primaryServices = chain.map((c) => c.service);
  for (const { service, pricingItem } of chain) {
    const followUp = pricingItem.hasFollowUp === true ? pricingItem.followUp : null;
    if (!followUp || !followUp.name?.trim() || (followUp.durationMinutes ?? 0) < 1) continue;
    if (primaryServices.some((p) => primaryMatchesFollowUp(p, followUp))) continue;
    const key = getFollowUpKey(followUp);
    if (!seen.has(key)) {
      seen.set(key, {
        name: followUp.name.trim(),
        serviceId: followUp.serviceId ?? null,
        durationMinutes: followUp.durationMinutes,
        waitMinutes: Math.max(0, followUp.waitMinutes ?? 0),
      });
    }
  }
  return Array.from(seen.values());
}

/** Default name for the single finishing service (e.g. פן) when needsFinish is true. */
const FAN_SERVICE_NAME = "פן";

/**
 * If any selected service has requiresFinish, append the single finishing service (FAN, e.g. פן) once at the end.
 * Do NOT append phase2 of the first service; the finishing service is always FAN.
 * Do NOT duplicate if the finishing service is already explicitly selected.
 * Timing: finishStart = lastEnd + (lastService.finishGapMinutes ?? 0), finishEnd = finishStart + finishingService.duration.
 */
export function buildChainWithFinishingService(
  chain: ChainServiceInput[],
  services: SiteService[],
  pricingItems: PricingItem[],
  fanServiceName: string = FAN_SERVICE_NAME
): ChainServiceInput[] {
  if (chain.length === 0) return chain;
  const needsFan = chain.some((c) => (c.service as SiteService & { requiresFinish?: boolean }).requiresFinish === true);
  if (!needsFan) return chain;

  const alreadyHasFan = chain.some(
    (c) => (c.service.name || "").trim() === fanServiceName || c.service.id === fanServiceName
  );
  if (alreadyHasFan) return chain;

  const last = chain[chain.length - 1]!;
  const lastService = last.service as SiteService & { finishGapMinutes?: number };
  const explicitGap = lastService.finishGapMinutes;
  const followUpWait =
    last.pricingItem?.hasFollowUp === true && last.pricingItem?.followUp
      ? Math.max(0, last.pricingItem.followUp.waitMinutes ?? 0)
      : 0;
  const gap = explicitGap ?? followUpWait;

  const fanService = services.find(
    (s) => (s.name || "").trim() === fanServiceName || s.id === fanServiceName
  ) as SiteService | undefined;
  if (!fanService) return chain;

  const fanDuration = fanService.duration ?? 30;
  let fanPricingItem: PricingItem | null = pricingItems.find(
    (p) => p.serviceId === fanService.id || (p.service && p.service.trim() === (fanService.name || "").trim())
  ) ?? null;
  if (!fanPricingItem) {
    const now = new Date().toISOString();
    fanPricingItem = {
      id: `fan-${fanService.id}`,
      serviceId: fanService.id,
      durationMinMinutes: fanDuration,
      durationMaxMinutes: fanDuration,
      createdAt: now,
      updatedAt: now,
    };
  }

  return [
    ...chain,
    {
      service: fanService,
      pricingItem: fanPricingItem,
      finishGapBefore: gap,
    },
  ];
}

/**
 * Compute chain slots with start/end times. Does NOT resolve workers.
 * Single-service: per-service follow-up (unchanged). Multi-service: when needsFinish we only have the appended finishing service at end; otherwise deduplicated follow-ups at end.
 */
export function computeChainSlots(
  chain: ChainServiceInput[],
  startAt: Date
): Omit<ChainSlot, "workerId" | "workerName">[] {
  if (chain.length <= 1) {
    return computeChainSlotsSingle(chain, startAt);
  }
  return computeChainSlotsDeduped(chain, startAt);
}

/** Single-service chain: each service can have its own follow-up (existing behavior). */
function computeChainSlotsSingle(
  chain: ChainServiceInput[],
  startAt: Date
): Omit<ChainSlot, "workerId" | "workerName">[] {
  const slots: Omit<ChainSlot, "workerId" | "workerName">[] = [];
  let cursor = new Date(startAt.getTime());

  for (let i = 0; i < chain.length; i++) {
    const { service, pricingItem } = chain[i]!;
    const durationMin = pricingItem.durationMaxMinutes ?? pricingItem.durationMinMinutes ?? 30;
    const endAt = new Date(cursor.getTime() + durationMin * 60 * 1000);

    const followUp = pricingItem.hasFollowUp === true ? pricingItem.followUp : null;
    const hasFollowUp = !!followUp && !!followUp.name?.trim() && (followUp.durationMinutes ?? 0) >= 1;
    const waitMin = hasFollowUp ? Math.max(0, followUp!.waitMinutes ?? 0) : 0;
    const followUpDurationMin = hasFollowUp ? followUp!.durationMinutes! : 0;

    const slot: Omit<ChainSlot, "workerId" | "workerName"> = {
      serviceOrder: i,
      serviceName: service.name,
      serviceId: service.id ?? null,
      serviceType: pricingItem.type ?? null,
      durationMin,
      startAt: new Date(cursor.getTime()),
      endAt: new Date(endAt.getTime()),
      followUp: hasFollowUp
        ? {
            serviceName: followUp!.name.trim(),
            serviceId: followUp!.serviceId ?? null,
            durationMin: followUpDurationMin,
            waitMin,
            startAt: new Date(endAt.getTime() + waitMin * 60 * 1000),
            endAt: new Date(endAt.getTime() + (waitMin + followUpDurationMin) * 60 * 1000),
            workerId: null,
            workerName: null,
          }
        : undefined,
    };
    slots.push(slot);

    if (hasFollowUp) {
      cursor = new Date(slot.followUp!.endAt.getTime());
    } else {
      cursor = new Date(endAt.getTime());
    }
  }

  return slots;
}

/** Multi-service: primary slots; when chain has finishing service (finishGapBefore) only those slots. Otherwise deduplicated follow-ups at end. */
function computeChainSlotsDeduped(
  chain: ChainServiceInput[],
  startAt: Date
): Omit<ChainSlot, "workerId" | "workerName">[] {
  const slots: Omit<ChainSlot, "workerId" | "workerName">[] = [];
  let cursor = new Date(startAt.getTime());

  for (let i = 0; i < chain.length; i++) {
    const item = chain[i]!;
    const { service, pricingItem } = item;
    const gapMin = item.finishGapBefore ?? 0;
    if (gapMin > 0) {
      cursor = new Date(cursor.getTime() + gapMin * 60 * 1000);
    }
    const durationMin = pricingItem.durationMaxMinutes ?? pricingItem.durationMinMinutes ?? 30;
    const endAt = new Date(cursor.getTime() + durationMin * 60 * 1000);

    slots.push({
      serviceOrder: i,
      serviceName: service.name,
      serviceId: service.id ?? null,
      serviceType: pricingItem.type ?? null,
      durationMin,
      startAt: new Date(cursor.getTime()),
      endAt: new Date(endAt.getTime()),
      followUp: undefined,
    });
    cursor = new Date(endAt.getTime());
  }

  const hasFinishingService = chain.some((c) => c.finishGapBefore != null);
  if (hasFinishingService) return slots;

  const dedupedFollowUps = collectDedupedFollowUps(chain);
  if (dedupedFollowUps.length === 0) return slots;

  const firstWait = dedupedFollowUps[0]!.waitMinutes;
  cursor = new Date(cursor.getTime() + firstWait * 60 * 1000);

  for (let j = 0; j < dedupedFollowUps.length; j++) {
    const fu = dedupedFollowUps[j]!;
    if (j > 0) {
      cursor = new Date(cursor.getTime() + (fu.waitMinutes || 0) * 60 * 1000);
    }
    const endAt = new Date(cursor.getTime() + fu.durationMinutes * 60 * 1000);
    slots.push({
      serviceOrder: chain.length + j,
      serviceName: fu.name,
      serviceId: fu.serviceId ?? null,
      serviceType: null,
      durationMin: fu.durationMinutes,
      startAt: new Date(cursor.getTime()),
      endAt,
      followUp: undefined,
    });
    cursor = endAt;
  }

  return slots;
}

function isWorkerAvailableInSlot(
  workerId: string,
  slotStartMinutes: number,
  slotEndMinutes: number,
  dateStr: string,
  bookingsForDate: ResolveChainWorkersParams["bookingsForDate"],
  workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null>,
  businessWindow: { startMin: number; endMin: number } | null
): boolean {
  const busyIntervals = getWorkerBusyIntervals(bookingsForDate, workerId, dateStr);
  const hasConflict = busyIntervals.some((iv) =>
    overlaps(slotStartMinutes, slotEndMinutes, iv.startMin, iv.endMin)
  );
  if (hasConflict) return false;
  const window = workerWindowByWorkerId[workerId];
  const fitsWindow =
    !window ||
    (slotStartMinutes >= window.startMin &&
      slotEndMinutes <= window.endMin &&
      (!businessWindow || (slotStartMinutes >= businessWindow.startMin && slotEndMinutes <= businessWindow.endMin)));
  return fitsWindow;
}

/** Params for no-preference slot validity (same as resolveChainWorkers minus preferredWorkerId). */
export interface SlotValidNoPreferenceParams {
  chain: ChainServiceInput[];
  startAt: Date;
  dateStr: string;
  workers: ResolveChainWorkersParams["workers"];
  bookingsForDate: ResolveChainWorkersParams["bookingsForDate"];
  workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null>;
  businessWindow: { startMin: number; endMin: number } | null;
  /** Break ranges: only service segments are checked; wait gaps are ignored. */
  breaks?: BreakRange[] | undefined;
  /** Worker-specific breaks for this day (key = workerId). Same segment-based logic. */
  workerBreaksByWorkerId?: Record<string, BreakRange[] | undefined>;
}

export interface SlotValidNoPreferenceResult {
  valid: boolean;
  /** For dev logs: which item index (0-based) failed, if any. */
  rejectItemIndex?: number;
  /** For dev logs: 'no_eligible' | 'no_available'. */
  rejectReason?: string;
  /** For dev logs: service name of failed item. */
  rejectServiceName?: string;
  /** For dev logs: when rejectReason is 'no_available', which booking overlaps. */
  rejectOverlappingBooking?: { bookingId?: string; workerId: string; startMin: number; endMin: number };
}

/**
 * Dedicated "no preference" slot validity: a time slot is valid iff for EVERY service item
 * (main + follow-ups) there is at least one worker who can do that service AND is available
 * in that item's time window. Workers may differ per item.
 * Use this when preferredWorkerId is null to avoid any single-worker or preferred-worker filtering.
 */
export function slotIsValidForNoPreference(params: SlotValidNoPreferenceParams): SlotValidNoPreferenceResult {
  const {
    chain,
    startAt,
    dateStr,
    workers,
    bookingsForDate,
    workerWindowByWorkerId,
    businessWindow,
    breaks,
    workerBreaksByWorkerId,
  } = params;

  const slots = computeChainSlots(chain, startAt);
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);

  type Item = { serviceName: string; serviceId: string | null; startMin: number; endMin: number };
  const items: Item[] = [];
  for (const slot of slots) {
    const startMin = Math.round((slot.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
    const endMin = startMin + slot.durationMin;
    items.push({
      serviceName: (slot.serviceName && String(slot.serviceName).trim()) || "",
      serviceId: (slot.serviceId && String(slot.serviceId).trim()) || null,
      startMin,
      endMin,
    });
    if (slot.followUp && slot.followUp.serviceName) {
      const fuStartMin = Math.round((slot.followUp.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
      const fuEndMin = fuStartMin + slot.followUp.durationMin;
      items.push({
        serviceName: slot.followUp.serviceName.trim(),
        serviceId: (slot.followUp.serviceId && String(slot.followUp.serviceId).trim()) || null,
        startMin: fuStartMin,
        endMin: fuEndMin,
      });
    }
  }

  // Breaks: only service segments are checked; wait gaps are ignored.
  if (breaks?.length) {
    const segments = items.map((it) => ({ startMin: it.startMin, endMin: it.endMin }));
    if (anyServiceSegmentOverlapsBreaks(segments, breaks)) {
      const itemIndex = items.findIndex((it) => slotOverlapsBreaks(it.startMin, it.endMin, breaks));
      const rejectIndex = itemIndex >= 0 ? itemIndex : 0;
      return {
        valid: false,
        rejectItemIndex: rejectIndex,
        rejectReason: "break",
        rejectServiceName: items[rejectIndex]?.serviceName ?? items[rejectIndex]?.serviceId ?? undefined,
      };
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    let eligible = workersWhoCanPerformService(workers, item.serviceName);
    if (eligible.length === 0 && item.serviceId && item.serviceId !== item.serviceName) {
      eligible = workersWhoCanPerformService(workers, item.serviceId);
    }
    if (eligible.length === 0) {
      return {
        valid: false,
        rejectItemIndex: i,
        rejectReason: "no_eligible",
        rejectServiceName: item.serviceName || item.serviceId || undefined,
      };
    }
    let availableEligible = eligible.filter((w) =>
      isWorkerAvailableInSlot(
        w.id,
        item.startMin,
        item.endMin,
        dateStr,
        bookingsForDate,
        workerWindowByWorkerId,
        businessWindow
      )
    );
    // Worker breaks: exclude workers whose break overlaps this service segment (same logic as business breaks).
    if (workerBreaksByWorkerId && availableEligible.length > 0) {
      availableEligible = availableEligible.filter(
        (w) => !slotOverlapsBreaks(item.startMin, item.endMin, workerBreaksByWorkerId[w.id])
      );
    }
    if (availableEligible.length === 0) {
      let rejectOverlappingBooking: { bookingId?: string; workerId: string; startMin: number; endMin: number } | undefined;
      const firstEligible = eligible[0];
      if (firstEligible) {
        const conflict = getConflictingBusyInterval(bookingsForDate, firstEligible.id, dateStr, item.startMin, item.endMin);
        if (conflict) rejectOverlappingBooking = { bookingId: conflict.bookingId, workerId: firstEligible.id, startMin: conflict.startMin, endMin: conflict.endMin };
      }
      return {
        valid: false,
        rejectItemIndex: i,
        rejectReason: "no_available",
        rejectServiceName: item.serviceName || item.serviceId || undefined,
        rejectOverlappingBooking,
      };
    }
  }

  return { valid: true };
}

export interface ComputeAvailableSlotsParams {
  /** Date for the slots (used to build startAt from each time string) */
  date: Date;
  dateStr: string;
  chain: ChainServiceInput[];
  /** null = "ללא העדפה" (union of all valid slots); string = preferred worker id */
  preferredWorkerId: string | null;
  workers: ResolveChainWorkersParams["workers"];
  bookingsForDate: ResolveChainWorkersParams["bookingsForDate"];
  workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null>;
  businessWindow: { startMin: number; endMin: number } | null;
  /** Candidate time strings "HH:mm" to filter (e.g. from business hours + slot interval) */
  candidateTimes: string[];
  /** Break ranges: only service segments are checked; wait gaps are ignored. */
  breaks?: BreakRange[] | undefined;
  /** Worker-specific breaks for this day (key = workerId). Same segment-based logic. */
  workerBreaksByWorkerId?: Record<string, BreakRange[] | undefined>;
}

/**
 * Single function for available slot computation. Returns time strings that are valid for booking.
 * - preferredWorkerId === null: slot valid iff every chain item has ≥1 eligible+available worker.
 * - preferredWorkerId set: slot valid iff resolveChainWorkers succeeds with that worker (and reassignments for follow-ups).
 * Call from both public and admin flows; ensure preferredWorkerId is in your useMemo/query deps so slots update when worker changes.
 */
export function computeAvailableSlots(params: ComputeAvailableSlotsParams): string[] {
  const {
    date,
    dateStr,
    chain,
    preferredWorkerId,
    workers,
    bookingsForDate,
    workerWindowByWorkerId,
    businessWindow,
    candidateTimes,
    breaks,
    workerBreaksByWorkerId,
  } = params;

  const debug = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true";

  if (chain.length === 0 || candidateTimes.length === 0) return [];

  const noPreference = preferredWorkerId == null || preferredWorkerId.trim() === "";

  if (noPreference) {
    const kept: string[] = [];
    for (const time of candidateTimes) {
      const [hh, mm] = time.split(":").map(Number);
      const startAt = new Date(date);
      startAt.setHours(hh, mm, 0, 0);
      const result = slotIsValidForNoPreference({
        chain,
        startAt,
        dateStr,
        workers,
        bookingsForDate,
        workerWindowByWorkerId,
        businessWindow,
        breaks,
        workerBreaksByWorkerId,
      });
      if (result.valid) {
        kept.push(time);
        if (debug) {
          const [y, m, d] = dateStr.split("-").map(Number);
          const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
          const slotStartMin = (startAt.getTime() - dayStart.getTime()) / (60 * 1000);
          const totalMin = chain.reduce((acc, c) => acc + (c.pricingItem.durationMaxMinutes ?? c.pricingItem.durationMinMinutes ?? 30), 0);
          const slotEndMin = slotStartMin + totalMin;
          console.debug("[computeAvailableSlots] slot shown (no preference)", {
            slotStart: time,
            slotEnd: `${Math.floor(slotEndMin / 60)}:${String(Math.round(slotEndMin % 60)).padStart(2, "0")}`,
            workerIds: "varies per chain item",
            bookingsLoaded: bookingsForDate.length,
          });
        }
      } else if (debug) {
        console.debug("[computeAvailableSlots] slot rejected (no preference)", {
          slotStart: time,
          rejectReason: result.rejectReason,
          rejectItemIndex: result.rejectItemIndex,
          rejectServiceName: result.rejectServiceName,
          overlappingBooking: result.rejectOverlappingBooking,
        });
      }
    }
    if (debug) {
      console.log("slotMode", { preferredWorkerId: null, mode: "all-workers", slotsCount: kept.length });
    }
    return kept;
  }

  const preferredId = preferredWorkerId!.trim();
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const filtered = candidateTimes.filter((time) => {
    const [hh, mm] = time.split(":").map(Number);
    const startAt = new Date(date);
    startAt.setHours(hh, mm, 0, 0);
    const resolved = resolveChainWorkers({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      preferredWorkerId: preferredId,
      workerWindowByWorkerId,
      businessWindow,
      workerBreaksByWorkerId,
    });
    if (resolved === null) return false;
    // Business breaks: only service segments are checked; wait gaps are ignored.
    if (breaks?.length) {
      const segments: { startMin: number; endMin: number }[] = [];
      for (const slot of resolved) {
        const startMin = Math.round((slot.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
        segments.push({ startMin, endMin: startMin + slot.durationMin });
        if (slot.followUp?.serviceName) {
          const fuStartMin = Math.round((slot.followUp.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
          segments.push({ startMin: fuStartMin, endMin: fuStartMin + slot.followUp.durationMin });
        }
      }
      if (anyServiceSegmentOverlapsBreaks(segments, breaks)) return false;
    }
    // Worker breaks: each segment checked against the assigned worker's breaks (same logic).
    if (workerBreaksByWorkerId) {
      for (const slot of resolved) {
        const startMin = Math.round((slot.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
        const endMin = startMin + slot.durationMin;
        if (slot.workerId && slotOverlapsBreaks(startMin, endMin, workerBreaksByWorkerId[slot.workerId])) return false;
        if (slot.followUp?.serviceName && slot.followUp.workerId) {
          const fuStartMin = Math.round((slot.followUp.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
          const fuEndMin = fuStartMin + slot.followUp.durationMin;
          if (slotOverlapsBreaks(fuStartMin, fuEndMin, workerBreaksByWorkerId[slot.followUp.workerId])) return false;
        }
      }
    }
    const kept = true;
    if (debug && kept && resolved) {
      const workerIds = [...new Set(resolved.map((s) => s.workerId).filter(Boolean))] as string[];
      const fuWorkers = resolved.map((s) => s.followUp?.workerId).filter(Boolean) as string[];
      const allIds = [...new Set([...workerIds, ...fuWorkers])];
      console.debug("[computeAvailableSlots] slot shown", {
        slotStart: time,
        slotEnd: resolved.length > 0 ? (() => {
          const last = resolved[resolved.length - 1]!;
          const end = last.followUp?.endAt ?? last.endAt;
          return `${end.getHours().toString().padStart(2, "0")}:${end.getMinutes().toString().padStart(2, "0")}`;
        })() : time,
        workerIds: allIds,
        bookingsLoaded: bookingsForDate.length,
      });
    }
    return kept;
  });
  if (debug) {
    console.log("slotMode", { preferredWorkerId: preferredId, mode: "preferred-worker", slotsCount: filtered.length });
  }
  return filtered;
}

/**
 * Resolve workers for entire chain. Each service item (main and follow-up) is assigned independently.
 * Follow-up services do NOT inherit the main service's workerId; they get their own worker via resolvePhase2Worker.
 * For EACH service in order:
 * 1) If preferredWorker can perform this service AND is available for this slot → assign preferredWorker to this item only.
 * 2) Else search all workers who can do this service and are available → assign first found to this item only.
 * 3) If none → return null (do not offer this time).
 */
export function resolveChainWorkers(params: ResolveChainWorkersParams): ChainSlot[] | null {
  const {
    chain,
    startAt,
    dateStr,
    workers,
    bookingsForDate,
    preferredWorkerId,
    workerWindowByWorkerId,
    businessWindow,
    workerBreaksByWorkerId,
  } = params;

  const slots = computeChainSlots(chain, startAt);
  const result: ChainSlot[] = [];
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const debug = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true";

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const isDedupedFollowUp = i >= chain.length;
    const serviceName = isDedupedFollowUp ? slot.serviceName : chain[i]!.service.name;
    const serviceIdRaw = (slot.serviceId && String(slot.serviceId).trim()) ? String(slot.serviceId).trim() : null;
    const serviceNameTrim = (serviceName && String(serviceName).trim()) ? String(serviceName).trim() : "";
    const chainItem = chain[i];
    const preferredWorker = preferredWorkerId ? workers.find((w) => w.id === preferredWorkerId) : null;
    const workerAllowedServiceIdsRaw = preferredWorker && Array.isArray(preferredWorker.services) ? preferredWorker.services : [];

    let eligible = workersWhoCanPerformService(workers, serviceNameTrim);
    if (eligible.length === 0 && serviceIdRaw && serviceIdRaw !== serviceNameTrim) {
      eligible = workersWhoCanPerformService(workers, serviceIdRaw);
    }
    const serviceIdentifier = eligible.length > 0 ? (serviceNameTrim || serviceIdRaw || "") : (serviceIdRaw || serviceNameTrim || "");
    if (eligible.length === 0) {
      if (debug) {
        console.debug("[resolveChainWorkers] slot", i + 1, "no eligible workers", { serviceId: serviceIdRaw, serviceName: serviceNameTrim });
      }
      return null;
    }

    if (debug) {
      const canDoByName = preferredWorker ? canWorkerPerformService(preferredWorker, serviceNameTrim) : false;
      const canDoById = preferredWorker && serviceIdRaw ? canWorkerPerformService(preferredWorker, serviceIdRaw) : false;
      console.debug("[resolveChainWorkers] chain item", i + 1, {
        chainItemIndex: i + 1,
        serviceId: serviceIdRaw,
        serviceName: serviceNameTrim,
        preferredWorkerId: preferredWorkerId ?? null,
        workerAllowedServiceIds: workerAllowedServiceIdsRaw,
        workerCanDoServiceByName: canDoByName,
        workerCanDoServiceById: canDoById,
        eligibleCount: eligible.length,
      });
    }

    const slotStartMinutes = Math.round((slot.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
    const slotEndMinutes = slotStartMinutes + slot.durationMin;

    let workerId: string | null = null;
    let workerName: string | null = null;

    const preferredEligible = preferredWorker && (canWorkerPerformService(preferredWorker, serviceNameTrim) || (!!serviceIdRaw && canWorkerPerformService(preferredWorker, serviceIdRaw)));
    if (preferredWorkerId && preferredEligible) {
      let available = isWorkerAvailableInSlot(
        preferredWorkerId,
        slotStartMinutes,
        slotEndMinutes,
        dateStr,
        bookingsForDate,
        workerWindowByWorkerId,
        businessWindow
      );
      if (available && workerBreaksByWorkerId?.[preferredWorkerId]?.length) {
        available = !slotOverlapsBreaks(slotStartMinutes, slotEndMinutes, workerBreaksByWorkerId[preferredWorkerId]);
      }
      if (available) {
        workerId = preferredWorkerId;
        workerName = preferredWorker!.name ?? null;
      }
      if (debug) {
        const conflict = !available ? getConflictingBusyInterval(bookingsForDate, preferredWorkerId, dateStr, slotStartMinutes, slotEndMinutes) : null;
        console.debug("[resolveChainWorkers] slot", i + 1, {
          serviceId: serviceIdentifier,
          preferredWorkerId,
          preferredEligible,
          preferredAvailable: available,
          selectedWorkerId: workerId,
          eligibleCount: eligible.length,
          eligibleIds: eligible.map((w) => w.id),
          ...(conflict && { overlappingBooking: { bookingId: conflict.bookingId, startMin: conflict.startMin, endMin: conflict.endMin } }),
        });
      }
    }

    if (!workerId) {
      // Phase 1 (i === 0): when a preferred worker is selected, ONLY show slot if that worker does phase 1. Do not fall back to others.
      if (preferredWorkerId && i === 0) {
        if (debug) {
          console.debug("[resolveChainWorkers] phase 1: preferred worker not available or not eligible, discarding slot", {
            preferredWorkerId,
            serviceId: serviceIdentifier,
          });
        }
        return null;
      }
      for (const w of eligible) {
        let available = isWorkerAvailableInSlot(
          w.id,
          slotStartMinutes,
          slotEndMinutes,
          dateStr,
          bookingsForDate,
          workerWindowByWorkerId,
          businessWindow
        );
        if (available && workerBreaksByWorkerId?.[w.id]?.length) {
          available = !slotOverlapsBreaks(slotStartMinutes, slotEndMinutes, workerBreaksByWorkerId[w.id]);
        }
        if (available) {
          workerId = w.id;
          workerName = w.name;
          if (debug) {
            console.debug("[resolveChainWorkers] slot", i + 1, "reassigned to eligible worker", {
              serviceId: serviceIdentifier,
              preferredWorkerId,
              selectedWorkerId: workerId,
              eligibleCount: eligible.length,
            });
          }
          break;
        }
      }
      if (!workerId) {
        if (debug) {
          let overlapping: { workerId: string; bookingId?: string; startMin: number; endMin: number } | null = null;
          for (const w of eligible) {
            const conflict = getConflictingBusyInterval(bookingsForDate, w.id, dateStr, slotStartMinutes, slotEndMinutes);
            if (conflict) {
              overlapping = { workerId: w.id, bookingId: conflict.bookingId, startMin: conflict.startMin, endMin: conflict.endMin };
              break;
            }
          }
          console.debug("[resolveChainWorkers] slot", i + 1, "no available worker among eligible", {
            serviceId: serviceIdentifier,
            preferredWorkerId,
            eligibleIds: eligible.map((w) => w.id),
            selectedWorkerId: null,
            overlappingBooking: overlapping,
          });
        }
        return null;
      }
    }

    if (!workerId || !workerName) return null;

    let followUpResolved: ChainSlot["followUp"] | undefined = slot.followUp;
    if (slot.followUp && slot.followUp.serviceName) {
      const phase2Worker = resolvePhase2Worker({
        phase1Worker: { id: workerId, name: workerName },
        preferredWorkerId: preferredWorkerId ?? undefined,
        dateStr,
        phase1StartMinutes: slotStartMinutes,
        phase1DurationMin: slot.durationMin,
        waitMin: slot.followUp.waitMin,
        phase2DurationMin: slot.followUp.durationMin,
        phase2ServiceName: slot.followUp.serviceName,
        phase2ServiceId: slot.followUp.serviceId ?? undefined,
        workers,
        bookingsForDate,
        workerWindowByWorkerId,
        businessWindow: businessWindow ?? undefined,
        workerBreaksByWorkerId,
      });
      if (!phase2Worker) {
        if (debug) {
          console.debug("[resolveChainWorkers] slot", i + 1, "followUp no worker", {
            followUpServiceId: slot.followUp.serviceId,
            followUpServiceName: slot.followUp.serviceName,
          });
        }
        return null;
      }
      followUpResolved = {
        ...slot.followUp,
        workerId: phase2Worker.id,
        workerName: phase2Worker.name,
      };
    }

    result.push({
      ...slot,
      workerId,
      workerName,
      followUp: followUpResolved,
      serviceColor: chainItem?.service.color ?? undefined,
      pricingItemId: chainItem?.pricingItem.id ?? undefined,
    });
  }

  return result;
}

/**
 * Check if chain can be fully assigned at given start time.
 */
export function canChainBeAssigned(params: ResolveChainWorkersParams): boolean {
  return resolveChainWorkers(params) !== null;
}

/** Single canonical API for assignment: same as resolveChainWorkers. Use this from all booking entry points. */
export function assignWorkersToServiceItems(params: ResolveChainWorkersParams): ChainSlot[] | null {
  return resolveChainWorkers(params);
}

export type WorkersForValidation = Array<{ id: string; name?: string; services?: string[]; active?: boolean; allServicesAllowed?: boolean }>;

export interface RepairInvalidAssignmentsParams {
  dateStr: string;
  bookingsForDate: ResolveChainWorkersParams["bookingsForDate"];
  workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null>;
  businessWindow: { startMin: number; endMin: number } | null;
}

/**
 * Repair invalid assignments BEFORE validation and write. For each service item (primary + follow-up):
 * If assignedWorkerId is missing OR workerCanDoService(worker, serviceId) is false OR worker not available
 * -> find replacement (eligible + available); if found set assignment, else return null.
 * All comparisons by serviceId. Returns repaired slots or null if repair impossible.
 */
export function repairInvalidAssignments(
  chainSlots: ChainSlot[],
  workers: WorkersForValidation,
  params: RepairInvalidAssignmentsParams
): ChainSlot[] | null {
  const { dateStr, bookingsForDate, workerWindowByWorkerId, businessWindow } = params;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const debug = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true";

  const repaired = chainSlots.map((slot) => ({
    ...slot,
    startAt: new Date(slot.startAt.getTime()),
    endAt: new Date(slot.endAt.getTime()),
    followUp: slot.followUp
      ? {
          ...slot.followUp,
          startAt: new Date(slot.followUp.startAt.getTime()),
          endAt: new Date(slot.followUp.endAt.getTime()),
        }
      : undefined,
  }));

  function findReplacementWorker(
    serviceId: string,
    serviceName: string,
    startAt: Date,
    endAt: Date,
    excludeWorkerId: string | null
  ): { id: string; name: string } | null {
    const nameTrim = (serviceName && String(serviceName).trim()) ? String(serviceName).trim() : "";
    const idTrim = (serviceId && String(serviceId).trim()) ? String(serviceId).trim() : null;
    let eligible = workersWhoCanPerformService(workers, nameTrim);
    if (eligible.length === 0 && idTrim && idTrim !== nameTrim) {
      eligible = workersWhoCanPerformService(workers, idTrim);
    }
    const startMin = Math.round((startAt.getTime() - dayStart.getTime()) / (60 * 1000));
    const endMin = Math.round((endAt.getTime() - dayStart.getTime()) / (60 * 1000));
    for (const w of eligible) {
      if (excludeWorkerId && w.id === excludeWorkerId) continue;
      if (isWorkerAvailableInSlot(w.id, startMin, endMin, dateStr, bookingsForDate, workerWindowByWorkerId, businessWindow)) {
        return { id: w.id, name: w.name ?? "" };
      }
    }
    return null;
  }

  for (let i = 0; i < repaired.length; i++) {
    const slot = repaired[i]!;
    const serviceId = (slot.serviceId && slot.serviceId.trim()) ? slot.serviceId : slot.serviceName;
    const slotStartMin = Math.round((slot.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
    const slotEndMin = slotStartMin + slot.durationMin;

    const assignedWorker = slot.workerId ? workers.find((w) => w.id === slot.workerId) : null;
    const canDo =
      assignedWorker &&
      slot.workerId &&
      (workerCanDoService(assignedWorker, slot.serviceName) || (serviceId && workerCanDoService(assignedWorker, serviceId)));
    const available =
      slot.workerId &&
      isWorkerAvailableInSlot(slot.workerId, slotStartMin, slotEndMin, dateStr, bookingsForDate, workerWindowByWorkerId, businessWindow);

    if (!slot.workerId || !canDo || !available) {
      const replacement = findReplacementWorker(serviceId ?? slot.serviceName, slot.serviceName, slot.startAt, slot.endAt, null);
      if (!replacement) return null;
      slot.workerId = replacement.id;
      slot.workerName = replacement.name;
    }

    if (slot.followUp && slot.followUp.serviceName && (slot.followUp.durationMin ?? 0) >= 1) {
      const fu = slot.followUp;
      const fuServiceId = (fu.serviceId && fu.serviceId.trim()) ? fu.serviceId : fu.serviceName;
      const fuStartMin = Math.round((fu.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
      const fuEndMin = Math.round((fu.endAt.getTime() - dayStart.getTime()) / (60 * 1000));

      const fuWorker = fu.workerId ? workers.find((w) => w.id === fu.workerId) : null;
      const fuCanDo =
        fuWorker &&
        fu.workerId &&
        (workerCanDoService(fuWorker, fu.serviceName) || (fuServiceId && workerCanDoService(fuWorker, fuServiceId)));
      const fuAvailable =
        fu.workerId &&
        isWorkerAvailableInSlot(fu.workerId, fuStartMin, fuEndMin, dateStr, bookingsForDate, workerWindowByWorkerId, businessWindow);

      if (debug) {
        console.debug("[repairInvalidAssignments] follow-up", {
          slotIndex: i + 1,
          serviceId: fuServiceId,
          serviceName: fu.serviceName,
          currentWorkerId: fu.workerId,
          canDoResult: fuCanDo,
          available: fuAvailable,
        });
      }

      if (!fu.workerId || !fuCanDo || !fuAvailable) {
        const replacement = findReplacementWorker(fuServiceId, fu.serviceName, fu.startAt, fu.endAt, null);
        if (!replacement) return null;
        fu.workerId = replacement.id;
        fu.workerName = replacement.name;
        if (debug) {
          console.debug("[repairInvalidAssignments] follow-up reassigned", {
            slotIndex: i + 1,
            serviceId: fuServiceId,
            replacementWorkerId: replacement.id,
          });
        }
      }
    }
  }

  return repaired;
}

/**
 * Validate that every slot and follow-up has a worker who is eligible for that service (by serviceId).
 * Call before save. Returns { valid, errors }.
 */
export function validateChainAssignments(
  chainSlots: Array<{
    serviceName: string;
    serviceId?: string | null;
    workerId: string | null;
    workerName?: string | null;
    followUp?: { serviceName: string; serviceId?: string | null; workerId: string | null; workerName?: string | null; durationMin?: number } | null;
  }>,
  workers: WorkersForValidation
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (let i = 0; i < chainSlots.length; i++) {
    const slot = chainSlots[i]!;
    const serviceName = slot.serviceName?.trim();
    if (!serviceName) {
      errors.push(`Slot ${i + 1}: missing service name`);
      continue;
    }
    const serviceId = (slot.serviceId && slot.serviceId.trim()) ? slot.serviceId : serviceName;
    if (!slot.workerId) {
      errors.push(`Slot ${i + 1} (${serviceName}): no worker assigned`);
      continue;
    }
    const worker = workers.find((w) => w.id === slot.workerId);
    if (!worker) {
      errors.push(`Slot ${i + 1} (${serviceName}): assigned worker not found`);
      continue;
    }
    const canDoMain = workerCanDoService(worker, serviceName) || (serviceId !== serviceName && workerCanDoService(worker, serviceId));
    if (!canDoMain) {
      errors.push(`Slot ${i + 1} (${serviceName}): worker "${worker.name ?? slot.workerId}" cannot perform this service`);
    }
    const fu = slot.followUp;
    if (fu && (fu.durationMin ?? 0) >= 1 && fu.serviceName) {
      const fuServiceName = fu.serviceName.trim();
      const fuServiceId = (fu.serviceId && fu.serviceId.trim()) ? fu.serviceId : fuServiceName;
      if (!fu.workerId) {
        errors.push(`Slot ${i + 1} follow-up (${fuServiceName}): no worker assigned`);
      } else {
        const fuWorker = workers.find((w) => w.id === fu.workerId);
        if (!fuWorker) {
          errors.push(`Slot ${i + 1} follow-up (${fuServiceName}): assigned worker not found`);
        } else {
          const canDoFu = workerCanDoService(fuWorker, fuServiceName) || (fuServiceId !== fuServiceName && workerCanDoService(fuWorker, fuServiceId));
          if (!canDoFu) {
            errors.push(`Slot ${i + 1} follow-up (${fuServiceName}): worker "${fuWorker.name ?? fu.workerId}" cannot perform this service`);
          }
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
