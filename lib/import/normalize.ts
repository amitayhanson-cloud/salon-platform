/**
 * Normalize phone for import. Israeli mobile format:
 * - Remove spaces/dashes/parentheses.
 * - +972 / 972 → 0 + rest.
 * - 9 digits (missing leading 0) → prefix 0.
 * - 05xxxxxxxx (10 digits) kept as-is.
 * - Non-Israeli: strip formatting only.
 */

export function normalizePhone(phone: string): string {
  const s = String(phone ?? "")
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .trim();
  if (!s) return "";

  const digits = s.replace(/\D/g, "");
  if (!digits) return s;

  // +972xxxxxxxxx or 972xxxxxxxxx → 0xxxxxxxxx
  if (digits.startsWith("972") && digits.length >= 12) {
    return "0" + digits.slice(3);
  }
  if (digits.startsWith("972") && digits.length >= 10) {
    return "0" + digits.slice(3);
  }

  // Israeli mobile: 9 digits starting with 5 → add leading 0
  if (digits.length === 9 && digits.startsWith("5")) {
    return "0" + digits;
  }

  // Already 10 digits starting with 05
  if (digits.length === 10 && digits.startsWith("05")) {
    return digits;
  }

  // Already has leading 0 and looks Israeli
  if (s.startsWith("0") && digits.length >= 9) {
    return digits.length === 10 ? digits : s;
  }

  // Non-Israeli or unknown: return digits-only (stripped)
  return digits;
}

/** Valid if normalized string has at least 7 digits (rejects e.g. "סוג לקוח", "VIP"). */
export function isValidPhone(phone: string): boolean {
  const norm = normalizePhone(phone);
  if (!norm) return false;
  const digitCount = (norm.match(/\d/g) || []).length;
  return digitCount >= 7;
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
