/**
 * Shared helpers for expired/past bookings cleanup.
 * Used by tests; Firebase functions has its own copy inlined.
 */

/** Returns YYYY-MM-DD for "now" in the given timezone. */
export function getTodayYMDInTimezone(tz: string): string {
  try {
    return new Date().toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Returns YYYY-MM-DD for a specific date in the given timezone. */
export function getDateYMDInTimezone(date: Date, tz: string): string {
  try {
    return date.toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
