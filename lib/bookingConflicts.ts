/**
 * Worker booking conflict checks for admin create/edit.
 * Half-open intervals: [startAt, endAt). Overlap exists if newStart < existingEnd AND newEnd > existingStart.
 */

import { getDocs, query, where } from "firebase/firestore";
import { bookingsCollection } from "./firestorePaths";

function toDate(val: Date | { toDate: () => Date } | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof (val as { toDate: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
  return null;
}

/** Half-open: overlap exists if newStart < existingEnd AND newEnd > existingStart. Touching (10:00–10:30 and 10:30–11:00) is allowed. */
export function intervalsOverlapHalfOpen(
  newStart: Date,
  newEnd: Date,
  existingStart: Date,
  existingEnd: Date
): boolean {
  return newStart.getTime() < existingEnd.getTime() && newEnd.getTime() > existingStart.getTime();
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingBooking?: {
    id: string;
    startAt: Date;
    endAt: Date;
    /** Formatted "HH:mm–HH:mm" for display */
    timeRange: string;
  };
}

/** Booking-like item with at least id, workerId, and start/end (or startAt/endAt), and a day key (dateISO/date/dateStr). */
export type BookingLikeForConflict = {
  id: string;
  workerId?: string | null;
  startAt?: Date | { toDate: () => Date };
  endAt?: Date | { toDate: () => Date };
  start?: Date | { toDate: () => Date };
  end?: Date | { toDate: () => Date };
  dateISO?: string;
  date?: string;
  dateStr?: string;
  status?: string;
  [key: string]: unknown;
};

/**
 * Find a conflicting booking for the given worker/slot from an existing list (sync, for client-side form).
 * Excludes cancelled and excluded IDs. Uses half-open overlap.
 */
export function findWorkerConflictFromBookings(
  bookings: BookingLikeForConflict[],
  workerId: string,
  dayISO: string,
  startAt: Date,
  endAt: Date,
  excludeBookingIds: string[] = []
): ConflictResult {
  const exclude = new Set(excludeBookingIds);
  for (const b of bookings) {
    const bid = b.id;
    if (exclude.has(bid)) continue;
    const w = b.workerId ?? null;
    if (!w || w !== workerId) continue;
    const docDay = (b.dateISO ?? b.date ?? b.dateStr ?? "") as string;
    if (docDay !== dayISO) continue;
    if (b.status === "cancelled") continue;
    const existingStart = toDate(b.startAt ?? b.start);
    const existingEnd = toDate(b.endAt ?? b.end);
    if (!existingStart || !existingEnd) continue;
    if (intervalsOverlapHalfOpen(startAt, endAt, existingStart, existingEnd)) {
      const fmt = (d: Date) => `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      return {
        hasConflict: true,
        conflictingBooking: {
          id: bid,
          startAt: existingStart,
          endAt: existingEnd,
          timeRange: `${fmt(existingStart)}–${fmt(existingEnd)}`,
        },
      };
    }
  }
  return { hasConflict: false };
}

export interface CheckWorkerConflictsParams {
  siteId: string;
  workerId: string;
  dayISO: string;
  startAt: Date;
  endAt: Date;
  /** Booking IDs to exclude (e.g. the booking being edited and its phase 2). */
  excludeBookingIds?: string[];
}

/**
 * Fetch bookings for worker/day from Firestore and run overlap check (for server/write path).
 * Uses query: workerId == X and dateISO == dayISO.
 */
export async function checkWorkerConflicts(params: CheckWorkerConflictsParams): Promise<ConflictResult> {
  const { siteId, workerId, dayISO, startAt, endAt, excludeBookingIds = [] } = params;
  const exclude = new Set(excludeBookingIds);
  const col = bookingsCollection(siteId);
  const q = query(
    col,
    where("workerId", "==", workerId),
    where("dateISO", "==", dayISO)
  );
  const snapshot = await getDocs(q);
  const bookings: BookingLikeForConflict[] = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      workerId: d.workerId ?? null,
      startAt: d.startAt,
      endAt: d.endAt,
      dateISO: (d.dateISO ?? d.date ?? "") as string,
      status: (d.status as string) ?? "confirmed",
    };
  });
  return findWorkerConflictFromBookings(bookings, workerId, dayISO, startAt, endAt, [...exclude]);
}
