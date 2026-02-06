/**
 * Local date helpers to avoid timezone bugs
 * Never use toISOString() for day keys - it converts to UTC and shifts the day
 */

/**
 * Format a Date to YYYY-MM-DD using local date parts (not UTC)
 */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to a local Date (not UTC)
 */
export function parseYmdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Strict YYYY-MM-DD regex (e.g. 2026-02-03). No DD/MM or MM/DD. */
const YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date param to a stable YYYY-MM-DD day key for queries.
 * Only accepts YYYY-MM-DD; otherwise returns today's key (avoids DD/MM vs MM/DD bugs).
 */
export function parseDateParamToDayKey(dateParam: string | undefined): string {
  const trimmed = (dateParam ?? "").trim();
  if (YYYY_MM_DD_REGEX.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return ymdLocal(new Date());
}

