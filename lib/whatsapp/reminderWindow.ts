/**
 * 24-hour reminder window for WhatsApp cron.
 *
 * Timezone approach:
 * - Firestore stores booking startAt as Timestamp (UTC). The booking system writes
 *   the appointment moment in UTC (e.g. "Feb 12 10:15 Israel" → stored as that instant).
 * - We compute the window in UTC: reminders send when appointment startAt falls in
 *   [now_utc + 24h - 60min, now_utc + 24h + 60min]. This is equivalent to "24h before"
 *   regardless of server location; no Israel-specific conversion is needed for the query.
 * - getNowIsraelISO() is for logging only (so logs show Israel time for debugging).
 * - When building the reminder message text, always format the displayed time with
 *   formatIsraelTime() from @/lib/datetime/formatIsraelTime so it shows in Asia/Jerusalem
 *   (e.g. 11:45 Israel, not 09:45 UTC). Do not use toLocaleTimeString without timeZone.
 */

const ISRAEL_TZ = "Asia/Jerusalem";

/** Current time formatted in Israel (for logging only). */
export function getNowIsraelISO(): string {
  return new Date().toLocaleString("en-CA", { timeZone: ISRAEL_TZ }).replace(",", "");
}

/**
 * Reminder window: send when appointment startAt is in [now+24h-60min, now+24h+60min].
 * 60min tolerance prevents missing reminders when cron runs late/early (e.g. cron-job.org drift).
 * Uses server UTC time; Firestore Timestamps are UTC, so comparison is correct.
 */
export function getReminderWindow(): {
  now: Date;
  nowISO: string;
  nowIsraelISO: string;
  windowStart: Date;
  windowEnd: Date;
  windowStartISO: string;
  windowEndISO: string;
} {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
  return {
    now,
    nowISO: now.toISOString(),
    nowIsraelISO: getNowIsraelISO(),
    windowStart,
    windowEnd,
    windowStartISO: windowStart.toISOString(),
    windowEndISO: windowEnd.toISOString(),
  };
}
