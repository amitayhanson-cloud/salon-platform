import type { BookingWaitlistEntry, BookingWaitlistOfferSlot } from "@/types/bookingWaitlist";

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

/** Whether the customer's footprint fits inside the freed visit structure (same start time). */
export function waitlistEntryFitsFreedStructure(
  entry: Pick<
    BookingWaitlistEntry,
    "primaryDurationMin" | "waitMinutes" | "followUpDurationMin" | "preferredWorkerId"
  >,
  slot: Pick<
    FreedBookingSlot,
    "primaryDurationMin" | "waitMinutes" | "followUpDurationMin" | "followUpWorkerId"
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

  if (ef > 0) {
    if (sf <= 0) return false;
    if (ew > sw) return false;
    if (ef > sf) return false;
  }

  return true;
}

/** Whether a waitlist entry wants this freed slot (service + date/worker prefs + duration/follow-up fit). */
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
  >,
  slot: FreedBookingSlot
): boolean {
  const prefDate = entry.preferredDateYmd?.trim();
  if (!prefDate || prefDate !== slot.dateYmd) return false;

  const prefW = entry.preferredWorkerId?.trim();
  const slotW = slot.workerId?.trim() || null;
  if (prefW && !slotW) return false;
  if (prefW && slotW && prefW !== slotW) return false;

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
    const en = norm(entry.serviceName || "");
    const sn = norm(slot.serviceName || "");
    if (en && sn && (en === sn || sn.includes(en) || en.includes(sn))) serviceOk = true;
  }
  if (!serviceOk) return false;

  return waitlistEntryFitsFreedStructure(entry, slot);
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
