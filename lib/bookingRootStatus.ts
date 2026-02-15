/**
 * Root booking resolution and display status for calendar tags.
 * Follow-ups MUST always show the root booking's status (single source of truth).
 * Read-only: uses existing parentBookingId only. No changes to creation or scheduling.
 */

import { getBookingDisplayStatus, type BookingDisplayStatus } from "./bookingDisplayStatus";

const MAX_PARENT_DEPTH = 10;

/** Booking-like object with id and optional parentBookingId (used only for lookup). */
export type BookingLikeForRoot = {
  id: string;
  parentBookingId?: string | null;
  whatsappStatus?: string | null;
  status?: string | null;
};

/**
 * Resolves the root booking id for a booking (the "first" in the same booking action).
 * Uses ONLY existing parentBookingId: walks up until no parent in the list (bounded by MAX_PARENT_DEPTH).
 * Pure, read-only, no side effects.
 */
export function resolveRootBookingId(
  booking: BookingLikeForRoot,
  bookingsById: Map<string, BookingLikeForRoot>
): string {
  let current: BookingLikeForRoot | undefined = booking;
  let depth = 0;
  while (current?.parentBookingId && depth < MAX_PARENT_DEPTH) {
    const parent = bookingsById.get(current.parentBookingId.trim());
    if (!parent) break;
    current = parent;
    depth++;
  }
  return current?.id ?? booking.id;
}

/**
 * Returns the display status (label + color) for the calendar tag.
 * For follow-ups, uses the ROOT booking's status so all bookings in the same action show the same tag.
 * If root is not in the list, falls back to the booking's own status (backwards compatible).
 */
export function getDisplayStatus(
  booking: BookingLikeForRoot,
  allBookings: BookingLikeForRoot[]
): BookingDisplayStatus {
  const byId = new Map<string, BookingLikeForRoot>();
  for (const b of allBookings) byId.set(b.id, b);
  const rootId = resolveRootBookingId(booking, byId);
  const root = byId.get(rootId);
  const source = root ?? booking;
  return getBookingDisplayStatus(source);
}
