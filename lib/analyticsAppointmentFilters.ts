/**
 * Rules for which appointments count toward dashboard “positive” metrics
 * (bookings count, revenue, utilization booked minutes, traffic attribution).
 *
 * We treat anything that {@link isDocCancelled} considers cancelled — including
 * `no_show`, `cancelled_by_salon`, and archive snapshots via `statusAtArchive` —
 * as **excluded**, not only the literal `status === "cancelled"` string.
 */

import { appointmentYmd, isDocCancelled } from "@/lib/cancelledBookingShared";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

export { appointmentYmd };

/**
 * True for visits that should increment bookings / revenue-style analytics.
 * Follow-ups are excluded (same as main booking aggregation).
 */
export function countsTowardBookingAnalytics(data: Record<string, unknown>): boolean {
  if (isFollowUpBooking(data)) return false;
  return !isDocCancelled(data);
}
