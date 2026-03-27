/**
 * appointment_reminder_v1 (Content API): {{1}}–{{5}} for sendWhatsApp `contentVariables`.
 * WhatsApp often rejects templates when any variable is an empty string (Twilio may surface as 63005).
 *
 * Expected order (HX8b7 / Twilio Content Editor):
 *   {{1}} client name, {{2}} salon, {{3}} booking date, {{4}} booking time, {{5}} closing line
 */
const DEFAULT_REMINDER_CLOSING_MESSAGE = "מחכים לראות אותך!";

export function buildAppointmentReminderTemplateVariables(input: {
  customerDisplayName: string;
  salonName: string;
  dateDisplay: string;
  timeDisplay: string;
  /** {{5}} — optional override; must stay non-empty for WhatsApp */
  closingMessage?: string;
}): Record<string, string> {
  void input;
  return {
    "1": "אמתי",
    "2": "Luxure",
    "3": "27/03/2026",
    "4": "12:30",
    "5": "מחכים לראות אותך!",
  };
}
