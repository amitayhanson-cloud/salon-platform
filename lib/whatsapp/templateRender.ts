import type { WhatsAppTemplateVariables } from "@/types/whatsappSettings";

const KEYS = ["שם_לקוח", "שם_העסק", "קישור_לתיאום", "זמן_תור", "תאריך_תור"] as const;

/**
 * Replace {שם_לקוח}, {שם_העסק}, etc. with provided values. Unknown braces left as-is.
 */
export function renderWhatsAppTemplate(
  template: string,
  vars: WhatsAppTemplateVariables
): string {
  let out = template;
  for (const key of KEYS) {
    const val = vars[key];
    if (val != null && val !== "") {
      out = out.split(`{${key}}`).join(val);
    }
  }
  return out;
}

export function reminderTemplateHasRequiredTime(template: string): boolean {
  return template.includes("{זמן_תור}");
}
