/**
 * Extract and normalize customer phone from a booking doc for WhatsApp.
 * Use in onBookingCreated and send-booking-confirmation so logic is consistent.
 */

import { normalizeE164 } from "./e164";

/** Booking-like shape (Firestore doc data or similar). */
export type BookingLike = Record<string, unknown> & {
  customerPhoneE164?: string | null;
  customerPhone?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  customer?: { phone?: string | null; phoneNumber?: string | null } | null;
};

const EMPTY = ["", undefined, null];

function pickFirst(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

/**
 * Get E.164 phone from a booking doc. Tries known fields in order.
 * Returns { e164 } or { error } so callers can handle missing phone without throwing.
 */
export function getBookingPhoneE164(
  booking: BookingLike,
  defaultCountry: "IL" | string = "IL"
): { e164: string } | { error: string } {
  const raw =
    pickFirst(
      booking.customerPhoneE164 as string | undefined,
      booking.customerPhone as string | undefined,
      booking.phone as string | undefined,
      booking.phoneNumber as string | undefined,
      booking.customer && typeof booking.customer === "object"
        ? (booking.customer.phone as string | undefined)
        : undefined,
      booking.customer && typeof booking.customer === "object"
        ? (booking.customer.phoneNumber as string | undefined)
        : undefined
    );
  if (!raw) {
    return { error: "Booking is missing customer phone number" };
  }
  const e164 = normalizeE164(raw, defaultCountry);
  if (!e164) {
    return { error: "Booking phone number could not be normalized to E.164" };
  }
  return { e164 };
}
