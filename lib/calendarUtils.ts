/**
 * Calendar utility functions for 2-week view and day schedule
 * Single source of truth for block positioning: dayStartLocal from dateISO, exact minutes from timestamps.
 */

import { ymdLocal, parseYmdToLocalDate } from "./dateLocal";

/** Firestore Timestamp or Date */
type TimestampLike = Date | { toDate: () => Date };

/** Shared day-schedule geometry: 15-min slots, 24px per slot → 1.6 px/min. Use everywhere so blocks and time bar align. */
export const SLOT_MINUTES = 15;
export const SLOT_HEIGHT_PX = 24;
export const PX_PER_MIN = SLOT_HEIGHT_PX / SLOT_MINUTES;

/**
 * Convert Firestore Timestamp or Date to local Date (same instant; getHours/getMinutes are local).
 */
export function toLocalDate(ts: TimestampLike | null | undefined): Date | null {
  if (ts == null) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as { toDate: () => Date }).toDate === "function") return (ts as { toDate: () => Date }).toDate();
  return null;
}

/**
 * Calendar day start at 00:00 in LOCAL timezone (not UTC).
 * Use this as baseline so blocks don't shift by timezone.
 */
export function dayStartLocalFromDateISO(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Minutes from start of the calendar day (local midnight) to the given time.
 * dateISO = YYYY-MM-DD for the visible day; blockStart = startAt as Date (local interpretation).
 */
export function minutesSinceStartOfDayLocal(dateISO: string, blockStart: Date): number {
  const dayStart = dayStartLocalFromDateISO(dateISO);
  return (blockStart.getTime() - dayStart.getTime()) / (60 * 1000);
}

/**
 * Duration in minutes between two timestamps (Date or Firestore Timestamp).
 */
export function durationMinutesLocal(tsStart: TimestampLike, tsEnd: TimestampLike): number {
  const start = toLocalDate(tsStart);
  const end = toLocalDate(tsEnd);
  if (!start || !end) return 0;
  return (end.getTime() - start.getTime()) / (60 * 1000);
}

/**
 * Get a date range starting from an anchor date
 * @param anchorDate Starting date
 * @param days Number of days in the range (default: 14)
 * @returns Array of Date objects
 */
export function getDateRange(anchorDate: Date, days: number = 14): Date[] {
  const range: Date[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(anchorDate);
    date.setDate(anchorDate.getDate() + i);
    date.setHours(0, 0, 0, 0);
    range.push(date);
  }
  return range;
}

/**
 * Convert Date to YYYY-MM-DD string (alias for ymdLocal for clarity)
 */
export function toYYYYMMDD(date: Date): string {
  return ymdLocal(date);
}

/**
 * Parse YYYY-MM-DD string to Date (alias for parseYmdToLocalDate)
 */
export function fromYYYYMMDD(ymd: string): Date {
  return parseYmdToLocalDate(ymd);
}

/**
 * Get minutes since start of day from HH:mm time string
 * @param time Time string in HH:mm format (e.g., "09:30")
 * @returns Minutes since midnight (e.g., 570 for 09:30)
 */
export function getMinutesSinceStartOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:mm string
 * @param minutes Minutes since midnight
 * @returns Time string in HH:mm format
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Options for time-to-position conversion. All times are local; dateISO is the visible day (YYYY-MM-DD).
 */
export interface BookingBlockPositionOptions {
  /** Minutes from midnight for the top of the visible range (e.g. 480 for 08:00). */
  viewStartMinutes: number;
  /** Minutes from midnight for the bottom of the visible range (e.g. 1200 for 20:00). */
  viewEndMinutes: number;
  /** Pixels per minute (e.g. SLOT_HEIGHT_PX / SLOT_MINUTES). Must match the time bar. */
  pxPerMin: number;
}

/**
 * Result of converting a booking's start/end into vertical position and height.
 */
export interface BookingBlockPosition {
  /** CSS top in pixels (relative to the visible range). */
  topPx: number;
  /** CSS height in pixels. */
  heightPx: number;
  /** Minutes from midnight (calendar day) to block start. */
  minutesFromDayStart: number;
  /** Duration in minutes. */
  durationMinutes: number;
}

/**
 * Single shared helper for ALL blocks (phase 1 and phase 2). No rounding; no phase-specific offsets.
 * Formula:
 *   minutesFromDayStart = (blockStart - dayStart) / 60000  [dayStart = local midnight from dateISO]
 *   topPx = (minutesFromDayStart - dayStartMinutes) * pxPerMinute
 *   heightPx = durationMinutes * pxPerMinute
 * Time bar labels use the same dayStart and pxPerMinute. slotMinutes = 15 (4 slots per hour).
 */
export interface ComputeBlockPositionParams {
  dateISO: string;
  start: Date;
  end: Date;
  dayStartMinutes: number;
  viewEndMinutes: number;
  slotMinutes: number;
  pxPerMinute: number;
}

export function computeBlockPosition(params: ComputeBlockPositionParams): BookingBlockPosition | null {
  const { dateISO, start, end, dayStartMinutes, viewEndMinutes, pxPerMinute } = params;
  const minutesFromDayStart = minutesSinceStartOfDayLocal(dateISO, start);
  const durationMinutes = durationMinutesLocal(start, end);
  if (durationMinutes <= 0) return null;
  if (minutesFromDayStart >= viewEndMinutes) return null;
  const blockEndMinutes = minutesFromDayStart + durationMinutes;
  if (blockEndMinutes <= dayStartMinutes) return null;
  const minutesFromViewStart = minutesFromDayStart - dayStartMinutes;
  const topPx = minutesFromViewStart * pxPerMinute;
  const heightPx = durationMinutes * pxPerMinute;
  return { topPx, heightPx, minutesFromDayStart, durationMinutes };
}

/**
 * Same as computeBlockPosition with options object. Used by BOTH phase 1 and phase 2.
 */
export function timeRangeToYPosition(
  dateISO: string,
  start: Date,
  end: Date,
  options: { viewStartMinutes: number; viewEndMinutes: number; pxPerMin: number }
): BookingBlockPosition | null {
  return computeBlockPosition({
    dateISO,
    start,
    end,
    dayStartMinutes: options.viewStartMinutes,
    viewEndMinutes: options.viewEndMinutes,
    slotMinutes: SLOT_MINUTES,
    pxPerMinute: options.pxPerMin,
  });
}

/**
 * Convert a booking's start/end times into vertical position and height.
 * Delegates to timeRangeToYPosition so phase 1 and phase 2 use the same formula.
 */
export function bookingBlockPosition(
  dateISO: string,
  blockStart: Date,
  blockEnd: Date,
  options: BookingBlockPositionOptions
): BookingBlockPosition | null {
  return timeRangeToYPosition(dateISO, blockStart, blockEnd, options);
}

/**
 * Convert a time string (HH:mm) to vertical position in pixels for grid lines and time bar labels.
 * Uses the same formula as booking blocks: (minutesFromMidnight - viewStartMinutes) * pxPerMin.
 */
export function timeToTopPx(
  timeHHmm: string,
  viewStartMinutes: number,
  pxPerMin: number
): number {
  const minutesFromDayStart = getMinutesSinceStartOfDay(timeHHmm);
  const minutesFromViewStart = minutesFromDayStart - viewStartMinutes;
  return minutesFromViewStart * pxPerMin;
}

/**
 * Get the Sunday of the week containing the given date
 * Week starts on Sunday (day 0)
 * @param date Any date in the week
 * @returns Sunday of that week (00:00:00)
 */
export function getSundayStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = d.getDate() - day; // Subtract days to get to Sunday
  const sunday = new Date(d.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

/**
 * Get the start of a 2-week period containing the given date
 * Always starts on Sunday of the week containing the date
 * Returns Sunday of the current week (week 1) + next week (week 2) = 14 days
 */
export function getTwoWeekStart(date: Date): Date {
  return getSundayStart(date);
}

/**
 * Generate 15-minute time slots for a day
 * @param startHour Start hour (0-23)
 * @param endHour End hour (0-23)
 * @returns Array of time strings in HH:mm format
 */
export function generateTimeSlots(startHour: number = 8, endHour: number = 20): string[] {
  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      if (hour === endHour && minute > 0) break; // Don't go past endHour
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

/**
 * Single source of truth for day schedule time geometry.
 * Use this for BOTH grid/labels AND block placement so they always align.
 * - Grid rows = one per 15-min slot (timeSlots array).
 * - Label at timeSlots[i] and grid line at timeSlots[i] use same topPx = i * SLOT_HEIGHT_PX.
 * - Block: topPx = (minutesFromDayStart - viewStartMinutes) * pxPerMin, heightPx = durationMinutes * pxPerMin.
 */
export interface DayScheduleGeometry {
  /** 15 — one slot per 15 minutes */
  slotMinutes: number;
  /** 24 — height of one 15-min slot in px */
  slotHeightPx: number;
  /** slotHeightPx / slotMinutes — px per minute (1.6) */
  pxPerMin: number;
  /** Minutes from midnight for view start (e.g. 480 for 08:00) */
  viewStartMinutes: number;
  /** Minutes from midnight for view end (e.g. 1200 for 20:00) */
  viewEndMinutes: number;
  /** Array of HH:mm from viewStart to viewEnd at 15-min intervals — use for labels AND grid rows */
  timeSlots: string[];
  /** timeSlots.length * slotHeightPx — total height of the schedule grid */
  totalHeightPx: number;
}

export function getDayScheduleGeometry(startHour: number = 8, endHour: number = 20): DayScheduleGeometry {
  const timeSlots = generateTimeSlots(startHour, endHour);
  const viewStartMinutes = startHour * 60;
  const viewEndMinutes = endHour * 60;
  return {
    slotMinutes: SLOT_MINUTES,
    slotHeightPx: SLOT_HEIGHT_PX,
    pxPerMin: PX_PER_MIN,
    viewStartMinutes,
    viewEndMinutes,
    timeSlots,
    totalHeightPx: timeSlots.length * SLOT_HEIGHT_PX,
  };
}
