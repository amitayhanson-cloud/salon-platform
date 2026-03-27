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
  const customerName = (input.customerDisplayName ?? "").trim() || "לקוח";
  const salonName = (input.salonName ?? "").trim() || "Luxure";
  const formattedDate = (input.dateDisplay ?? "").trim() || "---";
  const formattedTime = (input.timeDisplay ?? "").trim() || "---";
  const closingLine = (input.closingMessage ?? "").trim() || DEFAULT_REMINDER_CLOSING_MESSAGE || "---";

  return {
    "1": customerName || "---",
    "2": salonName || "---",
    "3": formattedDate || "---",
    "4": formattedTime || "---",
    "5": closingLine || "---",
  };
}
