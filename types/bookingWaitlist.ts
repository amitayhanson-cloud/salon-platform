export type BookingWaitlistStatus =
  | "active"
  | "notified"
  | "booked"
  | "cancelled"
  | "expired_offer";

export type BookingWaitlistOfferSlot = {
  dateYmd: string;
  timeHHmm: string;
  workerId: string | null;
  workerName?: string | null;
  durationMin: number;
  serviceName: string;
};

export type BookingWaitlistEntry = {
  customerName: string;
  customerPhoneE164: string;
  customerPhoneRaw?: string;
  serviceId?: string | null;
  serviceTypeId?: string | null;
  serviceName: string;
  preferredDateYmd?: string | null;
  preferredWorkerId?: string | null;
  status: BookingWaitlistStatus;
  offer?: BookingWaitlistOfferSlot;
  offerSentAt?: unknown;
  offerExpiresAt?: unknown;
  bookedBookingId?: string | null;
};
