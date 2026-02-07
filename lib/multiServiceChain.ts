/**
 * Multi-service booking chain: compute timing, resolve workers, validate availability.
 * Additive extension — does not change existing single-service or follow-up logic.
 */

import { canWorkerPerformService, workersWhoCanPerformService } from "./workerServiceCompatibility";
import { getWorkerBusyIntervals, overlaps } from "./bookingPhases";
import { resolvePhase2Worker } from "./phase2Assignment";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";

export interface ChainServiceInput {
  service: SiteService;
  pricingItem: PricingItem;
}

export interface ChainSlot {
  serviceOrder: number;
  serviceName: string;
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
  for (const { service, pricingItem } of chain) {
    total += pricingItem.durationMaxMinutes ?? pricingItem.durationMinMinutes ?? 30;
  }
  const deduped = collectDedupedFollowUps(chain);
  for (const fu of deduped) {
    total += (fu.waitMinutes ?? 0) + fu.durationMinutes;
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

/**
 * Compute chain slots with start/end times. Does NOT resolve workers.
 * Single-service: per-service follow-up (unchanged). Multi-service: deduplicated follow-ups at end.
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

/** Multi-service: primary slots only + deduplicated follow-ups at end as separate slots. */
function computeChainSlotsDeduped(
  chain: ChainServiceInput[],
  startAt: Date
): Omit<ChainSlot, "workerId" | "workerName">[] {
  const slots: Omit<ChainSlot, "workerId" | "workerName">[] = [];
  let cursor = new Date(startAt.getTime());

  for (let i = 0; i < chain.length; i++) {
    const { service, pricingItem } = chain[i]!;
    const durationMin = pricingItem.durationMaxMinutes ?? pricingItem.durationMinMinutes ?? 30;
    const endAt = new Date(cursor.getTime() + durationMin * 60 * 1000);

    slots.push({
      serviceOrder: i,
      serviceName: service.name,
      serviceType: pricingItem.type ?? null,
      durationMin,
      startAt: new Date(cursor.getTime()),
      endAt: new Date(endAt.getTime()),
      followUp: undefined,
    });
    cursor = new Date(endAt.getTime());
  }

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

/**
 * Resolve workers for entire chain. Prefers same worker if capable & available.
 * Returns array of slots with workers, or null if any slot cannot be assigned.
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
  } = params;

  const slots = computeChainSlots(chain, startAt);
  const result: ChainSlot[] = [];
  let lastWorkerId = preferredWorkerId ?? null;
  let lastWorkerName: string | null = preferredWorkerId
    ? workers.find((w) => w.id === preferredWorkerId)?.name ?? null
    : null;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const isDedupedFollowUp = i >= chain.length;
    const serviceName = isDedupedFollowUp ? slot.serviceName : chain[i]!.service.name;
    const chainItem = chain[i];

    const eligibleForPrimary = workersWhoCanPerformService(workers, serviceName);
    if (eligibleForPrimary.length === 0) return null;

    const [y, m, d] = dateStr.split("-").map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const slotStartMinutes = Math.round((slot.startAt.getTime() - dayStart.getTime()) / (60 * 1000));
    const slotEndMinutes = slotStartMinutes + slot.durationMin;

    let workerId: string | null = null;
    let workerName: string | null = null;

    if (lastWorkerId && canWorkerPerformService(workers.find((w) => w.id === lastWorkerId)!, serviceName)) {
      const busyIntervals = getWorkerBusyIntervals(bookingsForDate, lastWorkerId, dateStr);
      const hasConflict = busyIntervals.some((iv) =>
        overlaps(slotStartMinutes, slotEndMinutes, iv.startMin, iv.endMin)
      );
      const window = workerWindowByWorkerId[lastWorkerId];
      const fitsWindow =
        !window ||
        (slotStartMinutes >= window.startMin &&
          slotEndMinutes <= window.endMin &&
          (!businessWindow || (slotStartMinutes >= businessWindow.startMin && slotEndMinutes <= businessWindow.endMin)));
      if (!hasConflict && fitsWindow) {
        workerId = lastWorkerId;
        workerName = lastWorkerName;
      }
    }

    if (!workerId) {
      const toTry = [...eligibleForPrimary];
      if (preferredWorkerId && lastWorkerId !== preferredWorkerId) {
        const prefIdx = toTry.findIndex((w) => w.id === preferredWorkerId);
        if (prefIdx >= 0) {
          const [pref] = toTry.splice(prefIdx, 1);
          toTry.unshift(pref);
        }
      }
      for (const w of toTry) {
        const busyIntervals = getWorkerBusyIntervals(bookingsForDate, w.id, dateStr);
        const hasConflict = busyIntervals.some((iv) =>
          overlaps(slotStartMinutes, slotEndMinutes, iv.startMin, iv.endMin)
        );
        const window = workerWindowByWorkerId[w.id];
        const fitsWindow =
          !window ||
          (slotStartMinutes >= window.startMin &&
            slotEndMinutes <= window.endMin &&
            (!businessWindow || (slotStartMinutes >= businessWindow.startMin && slotEndMinutes <= businessWindow.endMin)));
        if (!hasConflict && fitsWindow) {
          workerId = w.id;
          workerName = w.name;
          break;
        }
      }
    }

    if (!workerId || !workerName) return null;

    lastWorkerId = workerId;
    lastWorkerName = workerName;

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
        workers,
        bookingsForDate,
        workerWindowByWorkerId,
        businessWindow: businessWindow ?? undefined,
      });
      if (!phase2Worker) return null;
      followUpResolved = {
        ...slot.followUp,
        workerId: phase2Worker.id,
        workerName: phase2Worker.name,
      };
      lastWorkerId = phase2Worker.id;
      lastWorkerName = phase2Worker.name;
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
