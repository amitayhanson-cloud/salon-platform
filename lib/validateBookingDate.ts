/**
 * Server-side validation: reject past-dated bookings.
 */

import { getDateYMDInTimezone } from "./expiredCleanupUtils";

/**
 * Returns true if the given date string (YYYY-MM-DD) is before today in the site timezone.
 */
export function isBookingDateInPast(siteTz: string, dateStr: string): boolean {
  const todayYMD = getDateYMDInTimezone(new Date(), siteTz);
  return dateStr < todayYMD;
}
