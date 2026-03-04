/**
 * Recurring (series) booking creation for Admin only.
 * Thin wrapper: computes occurrence dates and calls createAdminBooking once per occurrence.
 * No visitGroupId/parentBookingId/followUp linking; each booking is independent.
 */

import type { AdminBookingPayload } from "./adminBookings";
import { createAdminBooking } from "./adminBookings";

export const MAX_RECURRING_OCCURRENCES = 60;

export type RecurrenceMode = "endDate" | "count";

/** Frequency unit for recurrence. Default: weeks, interval 1 = weekly (same as legacy). */
export type RecurrenceFrequencyUnit = "weeks" | "months";

export interface RecurrenceRule {
  /** First occurrence date YYYY-MM-DD */
  startDate: string;
  /** Time preserved for all occurrences HH:mm */
  time: string;
  mode: RecurrenceMode;
  /** When mode === "endDate": last allowed date YYYY-MM-DD */
  endDate?: string;
  /** When mode === "count": number of occurrences (capped by MAX_RECURRING_OCCURRENCES) */
  count?: number;
  /** Recurrence step unit. Omit or "weeks" with interval 1 = weekly (legacy behavior). */
  frequencyUnit?: RecurrenceFrequencyUnit;
  /** Step size (e.g. 2 = every 2 weeks). Default 1. */
  frequencyInterval?: number;
}

export interface RecurringOccurrence {
  date: string;
  time: string;
}

export interface CreateRecurringResult {
  createdIds: string[];
  failedDates: Array< { date: string; time: string; error: string } >;
}

/**
 * Compute weekly occurrence date/time pairs from startDate, stepping by 7 days.
 * Preserves time. Stops at endDate or after count occurrences, and never exceeds maxOccurrences.
 */
export function computeWeeklyOccurrenceDates(
  startDate: string,
  time: string,
  options: { endDate?: string; count?: number; maxOccurrences?: number }
): RecurringOccurrence[] {
  const maxOccurrences = options.maxOccurrences ?? MAX_RECURRING_OCCURRENCES;
  const result: RecurringOccurrence[] = [];
  const [y0, m0, d0] = startDate.split("-").map(Number);
  const first = new Date(y0, (m0 ?? 1) - 1, d0 ?? 1, 0, 0, 0, 0);
  if (Number.isNaN(first.getTime())) return result;

  const useCount = options.count != null && options.count >= 1;
  const targetCount = useCount ? Math.min(options.count!, maxOccurrences) : maxOccurrences;
  let endDate: Date | null = null;
  if (options.endDate && !useCount) {
    const [ye, me, de] = options.endDate.split("-").map(Number);
    endDate = new Date(ye, (me ?? 1) - 1, de ?? 1, 23, 59, 59, 999);
    if (Number.isNaN(endDate.getTime())) endDate = null;
  }

  let current = new Date(first.getTime());
  const stepMs = 7 * 24 * 60 * 60 * 1000;

  while (result.length < maxOccurrences) {
    if (endDate != null && current.getTime() > endDate.getTime()) break;
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const d = current.getDate();
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    result.push({ date: dateStr, time });

    if (result.length >= targetCount) break;

    current = new Date(current.getTime() + stepMs);
  }

  return result;
}

export type RecurrenceOccurrenceOptions = {
  endDate?: string;
  count?: number;
  maxOccurrences?: number;
  /** Default "weeks" for backward compatibility. */
  frequencyUnit?: RecurrenceFrequencyUnit;
  /** Default 1. With unit "weeks", interval 1 = same as computeWeeklyOccurrenceDates. */
  frequencyInterval?: number;
};

/**
 * Generate recurrence occurrence date/time pairs.
 * Supports weekly (interval 1 = same as computeWeeklyOccurrenceDates), every N weeks, and monthly.
 * Monthly: same day-of-month; if target month has fewer days (e.g. 31st → Feb), clamp to last day of month.
 */
export function computeRecurrenceOccurrenceDates(
  startDate: string,
  time: string,
  options: RecurrenceOccurrenceOptions
): RecurringOccurrence[] {
  const maxOccurrences = options.maxOccurrences ?? MAX_RECURRING_OCCURRENCES;
  const unit = options.frequencyUnit ?? "weeks";
  const interval = Math.max(1, Math.floor(options.frequencyInterval ?? 1));

  const [y0, m0, d0] = startDate.split("-").map(Number);
  const first = new Date(y0, (m0 ?? 1) - 1, d0 ?? 1, 0, 0, 0, 0);
  if (Number.isNaN(first.getTime())) return [];

  const useCount = options.count != null && options.count >= 1;
  const targetCount = useCount ? Math.min(options.count!, maxOccurrences) : maxOccurrences;
  let endDate: Date | null = null;
  if (options.endDate && !useCount) {
    const [ye, me, de] = options.endDate.split("-").map(Number);
    endDate = new Date(ye, (me ?? 1) - 1, de ?? 1, 23, 59, 59, 999);
    if (Number.isNaN(endDate.getTime())) endDate = null;
  }

  const result: RecurringOccurrence[] = [];
  let current = new Date(first.getTime());

  while (result.length < maxOccurrences) {
    if (endDate != null && current.getTime() > endDate.getTime()) break;
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const d = current.getDate();
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    result.push({ date: dateStr, time });

    if (result.length >= targetCount) break;

    if (unit === "weeks") {
      current = new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    } else {
      // months: same day-of-month; if target month has fewer days (e.g. 31 → Feb), clamp to last day of that month
      const next = new Date(current.getFullYear(), current.getMonth() + interval, current.getDate(), 0, 0, 0, 0);
      if (next.getDate() !== current.getDate()) {
        next.setDate(0); // last day of previous month (e.g. Jan 31 + 1 month → Feb 28)
      }
      current = next;
    }
  }

  return result;
}

/**
 * Human-readable recurrence frequency label (e.g. "כל שבוע", "כל חודש").
 */
export function getRecurrenceFrequencyLabel(
  unit: RecurrenceFrequencyUnit,
  interval: number
): string {
  if (unit === "months") {
    if (interval === 1) return "כל חודש";
    return `כל ${interval} חודשים`;
  }
  if (interval === 1) return "כל שבוע";
  if (interval === 2) return "כל שבועיים";
  if (interval === 3) return "כל 3 שבועות";
  return `כל ${interval} שבועות`;
}

/**
 * Create one booking per occurrence using existing createAdminBooking.
 * Each booking is independent (no group/link fields).
 * Concurrency 1: process occurrences sequentially so each createAdminBooking completes before the next.
 * Do not use forEach(async) — use for...of with await so the loop runs to completion.
 */
export async function createRecurringBookings(
  siteId: string,
  basePayload: AdminBookingPayload,
  rule: RecurrenceRule,
  onProgress?: (current: number, total: number) => void
): Promise<CreateRecurringResult> {
  const occurrences = computeRecurrenceOccurrenceDates(
    rule.startDate,
    rule.time,
    {
      endDate: rule.mode === "endDate" ? rule.endDate : undefined,
      count: rule.mode === "count" ? rule.count : undefined,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
      frequencyUnit: rule.frequencyUnit ?? "weeks",
      frequencyInterval: rule.frequencyInterval ?? 1,
    }
  );

  if (occurrences.length === 0) {
    return { createdIds: [], failedDates: [] };
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[Recurring] createRecurringBookings: occurrences.length", occurrences.length, "rule.count", rule.count, "rule.mode", rule.mode);
  }

  const createdIds: string[] = [];
  const failedDates: CreateRecurringResult["failedDates"] = [];
  const total = occurrences.length;
  let index = 0;

  for (const occ of occurrences) {
    index++;
    if (process.env.NODE_ENV === "development") {
      console.log("[Recurring] creating occurrence", index, "of", total, "start", occ.date, occ.time);
    }
    onProgress?.(index, total);
    const { date, time } = occ;
    const payload: AdminBookingPayload = {
      ...basePayload,
      date,
      time,
    };
    try {
      const { phase1Id } = await createAdminBooking(siteId, payload);
      createdIds.push(phase1Id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failedDates.push({ date, time, error: msg });
      if (process.env.NODE_ENV === "development") {
        console.warn("[Recurring] occurrence", index, "failed", date, time, msg);
      }
      // Stop on first failure so UI can show "נוצרו X מתוך Y. החזרה מספר K נכשלה"
      break;
    }
  }

  return { createdIds, failedDates };
}
