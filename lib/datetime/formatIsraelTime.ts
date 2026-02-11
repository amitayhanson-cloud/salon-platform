/**
 * Format dates/times for display in Israel (Asia/Jerusalem) in WhatsApp messages
 * and webhook replies. Use this for all user-facing appointment time display;
 * do not use toLocaleString/toLocaleTimeString without timeZone (server may be UTC).
 *
 * Sanity check: A timestamp representing 2026-02-11 11:45 Asia/Jerusalem must
 * format as time "11:45" and date "11/02/2026" (DD/MM/YYYY).
 */

const ISRAEL_TZ = "Asia/Jerusalem";

export type TimestampLike =
  | Date
  | string
  | { toDate: () => Date }
  | { seconds: number }
  | null
  | undefined;

function toDate(ts: TimestampLike): Date {
  if (!ts) return new Date(0);
  if (ts instanceof Date) return ts;
  if (typeof ts === "string") return new Date(ts);
  if (typeof (ts as { toDate?: () => Date }).toDate === "function")
    return (ts as { toDate: () => Date }).toDate();
  if (typeof (ts as { seconds?: number }).seconds === "number")
    return new Date((ts as { seconds: number }).seconds * 1000);
  return new Date(Number(ts) || 0);
}

/**
 * Format a timestamp in Israel time.
 * @returns dateStr DD/MM/YYYY, timeStr HH:mm (24h)
 */
export function formatIsraelDateTime(tsOrDate: TimestampLike): {
  dateStr: string;
  timeStr: string;
} {
  const d = toDate(tsOrDate);
  const dateStr = d.toLocaleDateString("en-GB", {
    timeZone: ISRAEL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-GB", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { dateStr, timeStr };
}

/**
 * Format time only in Israel (HH:mm 24h). Use for WhatsApp messages.
 */
export function formatIsraelTime(tsOrDate: TimestampLike): string {
  const d = toDate(tsOrDate);
  return d.toLocaleTimeString("en-GB", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Short date in Israel (e.g. "Wed 11 Feb") for confirmation message.
 */
export function formatIsraelDateShort(tsOrDate: TimestampLike): string {
  const d = toDate(tsOrDate);
  return d.toLocaleDateString("he-IL", {
    timeZone: ISRAEL_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
