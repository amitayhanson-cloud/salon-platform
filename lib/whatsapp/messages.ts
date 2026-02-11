/**
 * Shared WhatsApp message copy for booking confirmation and 24h reminder.
 * Used by onBookingCreated and runReminders so copy is identical.
 */

/**
 * Build the 24h reminder / confirmation-request message body.
 * Same text used by cron and by immediate send for last-minute bookings.
 * @param salonName - e.g. from site config
 * @param timeStr - Appointment time in Israel (HH:mm), e.g. from formatIsraelTime()
 */
export function buildReminderMessage(salonName: string, timeStr: string): string {
  return `${salonName} ✂️
תזכורת: התור שלך מחר בשעה ${timeStr}.
מגיע/ה?
השב/השיבי:
כן, אגיע
או
לא, בסוף לא אוכל להגיע`;
}
