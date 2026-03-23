/**
 * Shared WhatsApp message copy for booking confirmation and 24h reminder.
 * Default reminder uses the same template as sites/{siteId}/settings/whatsapp (editable in admin).
 */

import { DEFAULT_REMINDER_TEMPLATE } from "@/types/whatsappSettings";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/templateRender";

/**
 * Build the 24h reminder / confirmation-request message body (default template).
 * @param salonName - e.g. from site config
 * @param timeStr - Appointment time in Israel (HH:mm), e.g. from formatIsraelTime()
 * @param dateStr - Short Israel date string (same as formatIsraelDateShort)
 */
export function buildReminderMessage(
  salonName: string,
  timeStr: string,
  dateStr: string,
  clientName = "לקוח/ה"
): string {
  return renderWhatsAppTemplate(DEFAULT_REMINDER_TEMPLATE, {
    שם_העסק: salonName,
    זמן_תור: timeStr,
    שם_לקוח: clientName,
    תאריך_תור: dateStr,
    business_name: salonName,
    time: timeStr,
    client_name: clientName,
    date: dateStr,
  });
}
