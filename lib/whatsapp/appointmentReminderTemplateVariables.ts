/**
 * appointment_reminder_v1 (Content API): diagnostic hardcoded 5 variables.
 */

export function buildAppointmentReminderTemplateVariables(input: {
  customerDisplayName: string;
  salonName: string;
  dateDisplay: string;
  timeDisplay: string;
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
