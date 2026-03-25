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

function ymdAtEpochMs(ms: number, tz: string): string {
  return new Date(ms).toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
}

/**
 * Epoch milliseconds for [start, end) of calendar day `ymd` (YYYY-MM-DD) in IANA `tz`
 * (start = first instant that maps to that date, endExclusive = first instant of the next calendar day).
 */
export function zonedDayRangeEpochMs(ymd: string, tz: string): { start: number; endExclusive: number } {
  const [y, mo, d] = ymd.split("-").map(Number);
  let lo = Date.UTC(y, mo - 1, d) - 48 * 3600_000;
  let hi = Date.UTC(y, mo - 1, d) + 48 * 3600_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ymdAtEpochMs(mid, tz) < ymd) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  let lo2 = start + 1;
  let hi2 = start + 32 * 3600_000;
  while (lo2 < hi2) {
    const mid = Math.floor((lo2 + hi2) / 2);
    if (ymdAtEpochMs(mid, tz) === ymd) lo2 = mid + 1;
    else hi2 = mid;
  }
  return { start, endExclusive: hi2 };
}
