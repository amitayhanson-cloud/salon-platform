import { zonedDayRangeEpochMs } from "@/lib/expiredCleanupUtils";

/** English short weekday in IL tz → readable Hebrew tick (Sun–Sat Israel week order). */
const EN_SHORT_TO_HEBREW: Record<string, string> = {
  Sun: "יום א׳",
  Mon: "יום ב׳",
  Tue: "יום ג׳",
  Wed: "יום ד׳",
  Thu: "יום ה׳",
  Fri: "יום ו׳",
  Sat: "יום ש׳",
};

/**
 * One-line x-axis label under each bar in admin week charts: `יום ב׳ · 26.3`
 * (explicit יום א׳…יום ו׳ / שבת, not locale-dependent abbreviations).
 */
export function hebrewWeekChartAxisLabel(ymd: string, tz = "Asia/Jerusalem"): string {
  const { start } = zonedDayRangeEpochMs(ymd, tz);
  const mid = start + 12 * 3600_000;
  const dt = new Date(mid);
  const enShort = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(dt);
  const day = ymd.slice(8, 10).replace(/^0/, "") || ymd.slice(9);
  const mo = String(Number(ymd.slice(5, 7)));
  const dayName = EN_SHORT_TO_HEBREW[enShort] ?? enShort;
  return `${dayName} · ${day}.${mo}`;
}
