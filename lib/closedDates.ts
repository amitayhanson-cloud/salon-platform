/**
 * Helpers for business closed dates (holidays) and business open/closed for a day.
 * Full-day closures in site timezone. Reuses same logic as availability (weekly hours + closed dates).
 */

import type { BookingSettings } from "@/types/bookingSettings";
import { fromYYYYMMDD, getMinutesSinceStartOfDay } from "./calendarUtils";

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a date to YYYY-MM-DD in local timezone (site timezone when run in browser).
 */
export function normalizeDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns true if the given date (YYYY-MM-DD) is in the site's closed dates list.
 * Use before computing availability so closed days return no slots.
 */
export function isClosedDate(
  bookingSettings: BookingSettings | null | undefined,
  dateYYYYMMDD: string
): boolean {
  if (!bookingSettings?.closedDates?.length) return false;
  const normalized = typeof dateYYYYMMDD === "string" && YYYY_MM_DD.test(dateYYYYMMDD.trim()) ? dateYYYYMMDD.trim() : null;
  if (!normalized) return false;
  return bookingSettings.closedDates.some((e) => e?.date?.trim() === normalized);
}

type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

/**
 * Returns true if the business has zero working minutes for the given day.
 * Uses the same rules as availability: specific closed dates (holidays) and weekly open-hours.
 * Use for the admin day-view banner "העסק סגור בתאריך זה".
 *
 * - Specific closed date (holiday) => true
 * - Weekly day disabled or no open interval => true
 * - Weekly day enabled but zero duration (start >= end) => true
 * - Partial day (e.g. 09:00–13:00) => false (business is open part of the day)
 * - Worker-only unavailability is not considered (business-level only).
 */
export function isBusinessClosedAllDay(params: {
  bookingSettings: BookingSettings | null | undefined;
  date: Date | string;
}): boolean {
  const { bookingSettings, date } = params;
  if (!bookingSettings) return true;

  const dateStr =
    typeof date === "string" && YYYY_MM_DD.test(date.trim())
      ? date.trim()
      : date instanceof Date
        ? normalizeDateToYYYYMMDD(date)
        : null;
  if (!dateStr) return true;

  if (isClosedDate(bookingSettings, dateStr)) return true;

  const d = typeof date === "string" ? fromYYYYMMDD(dateStr) : date;
  const dayKey = String(d.getDay()) as DayKey;
  const dayConfig = bookingSettings.days?.[dayKey];
  if (!dayConfig || !dayConfig.enabled) return true;

  const startMin = getMinutesSinceStartOfDay(dayConfig.start);
  const endMin = getMinutesSinceStartOfDay(dayConfig.end);
  if (endMin <= startMin) return true;

  return false;
}
