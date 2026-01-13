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

