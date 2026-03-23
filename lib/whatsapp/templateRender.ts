import type { WhatsAppTemplateVariables } from "@/types/whatsappSettings";

const ALIASES: Record<string, readonly string[]> = {
  שם_לקוח: ["שם_לקוח", "client_name"],
  שם_העסק: ["שם_העסק", "business_name"],
  קישור_לתיאום: ["קישור_לתיאום", "link"],
  זמן_תור: ["זמן_תור", "time"],
  תאריך_תור: ["תאריך_תור", "date"],
  custom_text: ["custom_text"],
};

/**
 * Replace {שם_לקוח}, {שם_העסק}, etc. with provided values. Unknown braces left as-is.
 */
export function renderWhatsAppTemplate(
  template: string,
  vars: WhatsAppTemplateVariables
): string {
  let out = template;
  for (const [canonical, keys] of Object.entries(ALIASES)) {
    const val =
      (vars as Record<string, string | undefined>)[canonical] ??
      keys.map((k) => (vars as Record<string, string | undefined>)[k]).find((v) => v != null && v !== "");
    if (val != null && val !== "") {
      for (const key of keys) {
        out = out.split(`{${key}}`).join(val);
      }
    }
  }
  return out;
}

export function reminderTemplateHasRequiredTime(template: string): boolean {
  return template.includes("{זמן_תור}");
}
