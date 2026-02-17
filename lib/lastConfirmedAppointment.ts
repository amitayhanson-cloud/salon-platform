/**
 * Resolve last confirmed past appointment for a client from their booking history.
 * Used on client details to show "תור אחרון" and "ימים מאז תור אחרון".
 * Does not touch booking creation or Firestore writes.
 */

import { isBookingCancelled } from "./normalizeBooking";
import { isBookingArchived } from "./normalizeBooking";

/** Booking-like shape used by the resolver (date/time or timestamps). */
export interface BookingForLastAppointment {
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  durationMin?: number;
  status?: string | null;
  whatsappStatus?: string | null;
  isArchived?: boolean;
  archivedAt?: unknown;
  /** If available, use for past check (preferred over date+time+duration). */
  start?: Date | { toDate: () => Date } | null;
  end?: Date | { toDate: () => Date } | null;
}

export interface LastConfirmedAppointmentResult {
  /** The date/time of the last confirmed past appointment, or null if none. */
  lastConfirmedAt: Date | null;
  /** Full days since that appointment (local date difference). 0 = same day, 1 = yesterday, etc. */
  daysSince: number | null;
  /** Booking id if caller needs it (optional; not all callers have id on the shape). */
  bookingId?: string | null;
}

function toDate(val: Date | { toDate: () => Date } | null | undefined): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return val;
  if (typeof (val as { toDate: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
  return null;
}

/**
 * Compute end time of a booking for "past" check.
 * Prefers end timestamp; else start + duration; else start only (date+time).
 */
function getBookingEnd(b: BookingForLastAppointment): Date | null {
  const endTs = toDate(b.end);
  if (endTs) return endTs;
  const startTs = toDate(b.start);
  if (startTs && typeof b.durationMin === "number" && b.durationMin > 0) {
    const end = new Date(startTs.getTime() + b.durationMin * 60 * 1000);
    return end;
  }
  if (b.date && b.time) {
    const [y, m, d] = b.date.split("-").map(Number);
    const [hh, mm] = (b.time || "00:00").split(":").map(Number);
    const start = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
    if (typeof b.durationMin === "number" && b.durationMin > 0) {
      return new Date(start.getTime() + b.durationMin * 60 * 1000);
    }
    return start;
  }
  return startTs;
}

/** True if booking is considered "confirmed" (same as calendar: not cancelled, not archived). */
function isConfirmed(b: BookingForLastAppointment): boolean {
  if (isBookingCancelled({ status: b.status, whatsappStatus: b.whatsappStatus })) return false;
  if (isBookingArchived(b)) return false;
  return true;
}

/**
 * Returns the last confirmed past appointment from the given bookings list.
 * Only considers bookings whose end time (or start if no end) is in the past.
 * Sorts by end/start descending and takes the first.
 */
export function getLastConfirmedPastAppointment(
  bookings: BookingForLastAppointment[],
  now: Date = new Date()
): LastConfirmedAppointmentResult {
  const confirmedPast = bookings
    .filter((b) => isConfirmed(b))
    .map((b) => {
      const endAt = getBookingEnd(b);
      return { b, endAt };
    })
    .filter(({ endAt }) => endAt != null && endAt.getTime() <= now.getTime()) as Array<{ b: BookingForLastAppointment; endAt: Date }>;

  if (confirmedPast.length === 0) {
    return { lastConfirmedAt: null, daysSince: null };
  }

  confirmedPast.sort((a, b) => b.endAt.getTime() - a.endAt.getTime());
  const last = confirmedPast[0]!;
  const lastAt = last.endAt;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const lastDayStart = new Date(lastAt.getFullYear(), lastAt.getMonth(), lastAt.getDate(), 0, 0, 0, 0);
  const daysSince = Math.floor((todayStart.getTime() - lastDayStart.getTime()) / (24 * 60 * 60 * 1000));

  return {
    lastConfirmedAt: lastAt,
    daysSince,
    bookingId: (last.b as { id?: string }).id ?? null,
  };
}
