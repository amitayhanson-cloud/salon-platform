/**
 * Single source of truth for booking status UI (calendar dots + details badge).
 * UI only: no changes to Firestore, Twilio, or booking logic.
 */

export type BookingStatusKey = "booked" | "pending" | "confirmed";

const PENDING_VALUES = new Set([
  "pending",
  "awaiting_confirmation",
  "awaiting_confirmation ",
  "whatsapp_pending",
]);

const CONFIRMED_VALUES = new Set([
  "confirmed",
  "accepted",
  "whatsapp_confirmed",
]);

/**
 * Normalizes raw status (e.g. whatsappStatus / status) to one of three UI keys.
 * Default => "booked".
 */
export function normalizeBookingStatus(
  rawStatus: string | undefined | null,
  _booking?: { whatsappStatus?: string | null; status?: string | null }
): BookingStatusKey {
  const s = (rawStatus ?? "").trim().toLowerCase();
  if (!s) return "booked";
  if (PENDING_VALUES.has(s)) return "pending";
  if (CONFIRMED_VALUES.has(s)) return "confirmed";
  return "booked";
}

export type StatusUi = {
  colorClass: string;
  dotStyle: string;
  badgeClass: string;
};

const STATUS_UI: Record<BookingStatusKey, StatusUi> = {
  booked: {
    colorClass: "bg-blue-500",
    dotStyle: "bg-blue-500",
    badgeClass: "bg-blue-100 text-blue-800",
  },
  pending: {
    colorClass: "bg-amber-400",
    dotStyle: "bg-amber-400",
    badgeClass: "bg-amber-100 text-amber-800",
  },
  confirmed: {
    colorClass: "bg-emerald-500",
    dotStyle: "bg-emerald-500",
    badgeClass: "bg-emerald-100 text-emerald-800",
  },
};

/**
 * Returns UI classes and styles for a status key (dot + badge).
 */
export function statusUi(statusKey: BookingStatusKey): StatusUi {
  return STATUS_UI[statusKey] ?? STATUS_UI.booked;
}
