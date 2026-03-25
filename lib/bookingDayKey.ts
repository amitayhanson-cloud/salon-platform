/**
 * Calendar day YYYY-MM-DD (Israel) for analytics bucketing.
 * Uses dateISO → date → startAt (same priority idea as listBookingsForDate).
 */

import { appointmentYmd } from "@/lib/cancelledBookingShared";
import { getDateYMDInTimezone, zonedDayRangeEpochMs } from "@/lib/expiredCleanupUtils";

const IL_TZ = "Asia/Jerusalem";

export function bookingDayYmdIsrael(data: Record<string, unknown>): string {
  const y = appointmentYmd(data);
  if (y.length >= 10) return y;
  const st = data.startAt as { toDate?: () => Date } | undefined;
  if (st && typeof st.toDate === "function") {
    try {
      const dt = st.toDate();
      if (dt && !Number.isNaN(dt.getTime())) return getDateYMDInTimezone(dt, IL_TZ);
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Inclusive YYYY-MM-DD range → Israel zoned [startMs, endExclusiveMs) for startAt queries. */
export function analyticsRangeToStartAtBounds(
  rangeStartYmd: string,
  rangeEndYmd: string
): { startMs: number; endExclusiveMs: number } {
  const { start: lo } = zonedDayRangeEpochMs(rangeStartYmd, IL_TZ);
  const { endExclusive: hi } = zonedDayRangeEpochMs(rangeEndYmd, IL_TZ);
  return { startMs: lo, endExclusiveMs: hi };
}
