import type { TimePreferenceValue } from "./timePreference";

export type BookingWaitlistStatus =
  | "waiting"
  | "pending_offer"
  | "active"
  | "notified"
  | "booked"
  | "cancelled"
  | "expired_offer"
  | "declined";

/** Snapshot of the freed calendar window (primary + optional follow-up segment). */
export type BookingWaitlistOfferSlot = {
  dateYmd: string;
  timeHHmm: string;
  workerId: string | null;
  workerName?: string | null;
  /** Primary segment length on workerId (minutes). */
  durationMin: number;
  serviceName: string;
  /** Same as freed slot: gap after primary before follow-up (minutes). */
  waitMinutes?: number;
  /** Follow-up segment length (0 if none). */
  followUpDurationMin?: number;
  followUpWorkerId?: string | null;
  followUpWorkerName?: string | null;
  followUpServiceName?: string | null;
  /** Freed primary capacity (same as durationMin; explicit for templates / matching). */
  primaryDurationMin?: number;
};

export type BookingWaitlistEntry = {
  customerName: string;
  customerPhoneE164: string;
  customerPhoneRaw?: string;
  serviceId?: string | null;
  serviceTypeId?: string | null;
  serviceName: string;
  /** Required for day-scoped waitlist (YYYY-MM-DD). */
  preferredDateYmd?: string | null;
  preferredWorkerId?: string | null;
  status: BookingWaitlistStatus;
  offer?: BookingWaitlistOfferSlot;
  offerSentAt?: unknown;
  offerExpiresAt?: unknown;
  bookedBookingId?: string | null;
  /** Monotonic position for this preferred day (1 = first). */
  queuePositionForDay?: number | null;
  /** Customer's primary service length when they joined (minutes). */
  primaryDurationMin?: number | null;
  waitMinutes?: number | null;
  followUpDurationMin?: number | null;
  /** Follow-up service label when followUpDurationMin > 0 */
  followUpServiceName?: string | null;
  /**
   * Preferred time-of-day buckets (site-local wall clock).
   * Omit or empty → treated as ["anytime"].
   */
  timePreference?: TimePreferenceValue[] | null;
};
