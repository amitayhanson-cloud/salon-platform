/**
 * Single source of truth for weekly schedule day mapping.
 * JS Date.getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday.
 * schedule.days keys: "0"=Sunday, "1"=Monday, ..., "6"=Saturday (string numbers).
 */

export type BookingScheduleDayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** JS getDay() (0-6) -> weekday string for worker availability */
export const JS_DAY_TO_WEEKDAY_KEY: Record<number, WeekdayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

/** schedule.days key for a given JS weekday. Must match Admin storage. */
const JS_DOW_TO_KEY: Record<number, BookingScheduleDayKey> = {
  0: "0",
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
};

/**
 * getJsDow(date, tz?) => 0..6 aligned with Sunday=0 (JS Date.getDay).
 * When tz is provided, returns weekday in that timezone.
 */
export function getJsDow(date: Date, tz?: string): number {
  if (!tz || typeof tz !== "string" || tz.trim() === "") {
    return date.getDay();
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz.trim(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const y = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
    const m = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10) - 1;
    const d = parseInt(parts.find((p) => p.type === "day")?.value ?? "1", 10);
    const local = new Date(y, m, d, 12, 0, 0);
    const dow = local.getDay();
    return dow >= 0 && dow <= 6 ? dow : date.getDay();
  } catch {
    return date.getDay();
  }
}

/**
 * getDayConfig(schedule, jsDow) => schedule.days[String(jsDow)].
 * schedule.days keys are "0".."6" (string numbers).
 * For calendar "is day enabled": pass jsDow = date.getDay() (local time, not UTC).
 */
export function getDayConfig(
  schedule: { days?: Record<string, { enabled?: boolean; start?: string; end?: string }> } | null | undefined,
  jsDow: number
): { enabled: boolean; start: string; end: string } | null {
  if (!schedule?.days || typeof schedule.days !== "object") return null;
  const key = JS_DOW_TO_KEY[jsDow] ?? (String(jsDow) as BookingScheduleDayKey);
  const entry = schedule.days[key] ?? schedule.days[String(jsDow)];
  if (!entry || typeof entry !== "object") return null;
  return {
    enabled: entry.enabled ?? false,
    start: typeof entry.start === "string" ? entry.start : "09:00",
    end: typeof entry.end === "string" ? entry.end : "17:00",
  };
}

/** @deprecated Use getJsDow */
export const getJsDayIndexForDate = getJsDow;

/**
 * Get the BookingSettings.days key for a date ("0"-"6").
 * Use this when looking up bookingSettings.days[dayKey].
 */
export function getBookingScheduleDayKey(
  date: Date,
  timeZone?: string
): BookingScheduleDayKey {
  const jsDay = getJsDayIndexForDate(date, timeZone);
  const key = String(jsDay) as BookingScheduleDayKey;
  return key;
}

/**
 * Convert JS day index to weekday key for worker availability.
 */
export function jsDayToWeekdayKey(jsDay: number): WeekdayKey {
  return JS_DAY_TO_WEEKDAY_KEY[jsDay] ?? "sun";
}

/**
 * Get the day schedule for a given JS weekday (0-6) from BookingSettings.days.
 * Single source of truth for schedule lookup.
 * Alias: getScheduleForJsDow for Admin & Booking consistency.
 */
export function getDaySchedule(
  days: Record<BookingScheduleDayKey, { enabled: boolean; start: string; end: string; breaks?: { start: string; end: string }[] }> | undefined,
  jsDow: number
): { enabled: boolean; start: string; end: string } | null {
  if (!days) return null;
  const key = String(jsDow) as BookingScheduleDayKey;
  const config = days[key];
  return config ?? null;
}

/** Alias: getJsDowInTz — used by both Admin & Booking. */
export const getJsDowInTz = getJsDayIndexForDate;

/** Alias: getScheduleForJsDow — used by both Admin & Booking. */
export const getScheduleForJsDow = getDaySchedule;
