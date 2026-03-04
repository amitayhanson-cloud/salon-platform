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
 * Returns the UTC Date for 00:00:00 on the given calendar date in Asia/Jerusalem.
 */
function getStartOfDayIsrael(year: number, month: number, day: number): Date {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  const hourIsrael = parseInt(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ISRAEL_TZ,
      hour: "numeric",
      hour12: false,
    }).format(noonUtc),
    10
  );
  return new Date(noonUtc.getTime() - hourIsrael * 60 * 60 * 1000);
}

/**
 * Tomorrow reminder window: reminders for ALL bookings on TOMORROW (Asia/Jerusalem).
 * tomorrowStart = 00:00 tomorrow Israel (UTC), tomorrowEnd = 00:00 day-after-tomorrow Israel (UTC).
 * Schedule cron once per day at 10:00 AM Asia/Jerusalem.
 */
export function getTomorrowReminderWindow(): {
  now: Date;
  nowISO: string;
  nowIsraelISO: string;
  windowStart: Date;
  windowEnd: Date;
  windowStartISO: string;
  windowEndISO: string;
} {
  const now = new Date();
  const todayIsrael = now.toLocaleString("en-CA", { timeZone: ISRAEL_TZ }).slice(0, 10);
  const [y, m, d] = todayIsrael.split("-").map(Number);
  const tomorrowDate = new Date(y, m - 1, d + 1);
  const tomorrowStr =
    tomorrowDate.getFullYear() +
    "-" +
    String(tomorrowDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(tomorrowDate.getDate()).padStart(2, "0");
  const dayAfterDate = new Date(y, m - 1, d + 2);
  const dayAfterStr =
    dayAfterDate.getFullYear() +
    "-" +
    String(dayAfterDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dayAfterDate.getDate()).padStart(2, "0");

  const [ty, tm, td] = tomorrowStr.split("-").map(Number);
  const [ey, em, ed] = dayAfterStr.split("-").map(Number);
  const windowStart = getStartOfDayIsrael(ty, tm, td);
  const windowEnd = getStartOfDayIsrael(ey, em, ed);

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

/**
 * Legacy: send when appointment startAt is in [now+24h-60min, now+24h+60min].
 * Still used by debug/test endpoints. Production cron uses getTomorrowReminderWindow().
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
