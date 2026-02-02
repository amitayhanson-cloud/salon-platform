/**
 * Normalize phone, date, time for import (consistent with app).
 */

export function normalizePhone(phone: string): string {
  return String(phone ?? "")
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .trim();
}

/** Parse YYYY-MM-DD or DD/MM/YYYY to YYYY-MM-DD. */
export function normalizeDate(value: string): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ddmmyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const yymmdd = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (yymmdd) return s;
  return null;
}

/** Parse time to HH:mm (24h). */
export function normalizeTime(value: string): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = match[4]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  if (/^\d{4}$/.test(s)) {
    const h = s.slice(0, 2);
    const m = s.slice(2, 4);
    return `${h}:${m}`;
  }
  return null;
}
