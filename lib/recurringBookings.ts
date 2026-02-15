/**
 * Recurring (series) booking creation for Admin only.
 * Thin wrapper: computes occurrence dates and calls createAdminBooking once per occurrence.
 * No visitGroupId/parentBookingId/followUp linking; each booking is independent.
 */

import type { AdminBookingPayload } from "./adminBookings";
import { createAdminBooking } from "./adminBookings";

export const MAX_RECURRING_OCCURRENCES = 60;

export type RecurrenceMode = "endDate" | "count";

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

/**
 * Create one booking per occurrence using existing createAdminBooking.
 * Each booking is independent (no group/link fields).
 * Concurrency 1 to avoid rate limits and keep order predictable.
 */
export async function createRecurringBookings(
  siteId: string,
  basePayload: AdminBookingPayload,
  rule: RecurrenceRule,
  onProgress?: (current: number, total: number) => void
): Promise<CreateRecurringResult> {
  const occurrences = computeWeeklyOccurrenceDates(
    rule.startDate,
    rule.time,
    {
      endDate: rule.mode === "endDate" ? rule.endDate : undefined,
      count: rule.mode === "count" ? rule.count : undefined,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    }
  );

  if (occurrences.length === 0) {
    return { createdIds: [], failedDates: [] };
  }

  const createdIds: string[] = [];
  const failedDates: CreateRecurringResult["failedDates"] = [];

  for (let i = 0; i < occurrences.length; i++) {
    onProgress?.(i + 1, occurrences.length);
    const { date, time } = occurrences[i];
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
    }
  }

  return { createdIds, failedDates };
}
