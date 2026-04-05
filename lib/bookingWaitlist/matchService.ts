import type { BookingWaitlistEntry, BookingWaitlistOfferSlot } from "@/types/bookingWaitlist";
import type { TimePreferenceValue } from "@/types/timePreference";
import { entryAcceptsTimeBucket } from "./timeBuckets";

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

/** First segment before " / " or " | " or " - " — aligns catalog names with "שירות / סוג" on bookings. */
function primaryServiceLabelForMatch(s: string): string {
  const t = norm(s);
  if (!t) return "";
  const parts = t.split(/\s*[/|]\s*|\s+-\s+/);
  return (parts[0] ?? t).trim();
}

/** Whether the customer's footprint fits inside the freed visit structure (same start time). */
export function waitlistEntryFitsFreedStructure(
  entry: Pick<
    BookingWaitlistEntry,
    "primaryDurationMin" | "waitMinutes" | "followUpDurationMin"
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

export type WaitlistSlotMatchOptions = {
  /** When true (e.g. admin "fill empty slot"), skip service type/id/name equality checks. */
  matchAnyService?: boolean;
  /** When set, entry must accept this time-of-day bucket (or "anytime"). */
  timeBucket?: Exclude<TimePreferenceValue, "anytime">;
};

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
    return `duration_or_phases entry primary=${ep}m wait=${ew} fu=${ef}m vs slot primary=${sp}m wait=${sw} fu=${sf}m`;
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

  if (options?.timeBucket != null) {
    if (!entryAcceptsTimeBucket(entry.timePreference, options.timeBucket)) return false;
  }

  if (!options?.matchAnyService) {
    if (!waitlistEntryServiceMatchesFreedSlot(entry, slot)) return false;
  }

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
