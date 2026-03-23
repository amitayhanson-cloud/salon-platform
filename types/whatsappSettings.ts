/**
 * Per-site WhatsApp templates & automation toggles.
 * Stored at sites/{siteId}/settings/whatsapp
 */

export type WhatsAppSettingsDoc = {
  confirmationEnabled: boolean;
  confirmationTemplate: string;
  reminderEnabled: boolean;
  reminderTemplate: string;
  /** Template for manual broadcaster. */
  broadcastTemplate: string;
  /** Optional custom text appended into confirmation template. */
  confirmationCustomText: string;
  /** Hours before appointment (UI + future scheduling; cron may still use fixed window). */
  reminderHoursBefore: number;
};

export const DEFAULT_CONFIRMATION_TEMPLATE =
  "היי {client_name}, התור שלך ב-{business_name} בתאריך {date} בשעה {time}. {confirmation_waze_block} {custom_text}";

export const DEFAULT_REMINDER_TEMPLATE = `תזכורת: היי {client_name}, מחכים לך ב-{business_name} בתאריך {date} בשעה {time}. {reminder_waze_block}

מגיעים? השיבו להודעה זו:
כן, אגיע
או
לא, נא לבטל`;

export const DEFAULT_BROADCAST_TEMPLATE =
  "היי {client_name}! הודעה מ-{business_name}: {custom_text}. לפרטים: {link}";

/** Shown in admin / API errors; validation accepts either tag (see reminderTemplateHasRequiredTime). */
export const REMINDER_REQUIRED_PLACEHOLDER = "{זמן_תור} או {time}";

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsDoc = {
  confirmationEnabled: true,
  confirmationTemplate: DEFAULT_CONFIRMATION_TEMPLATE,
  reminderEnabled: true,
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  broadcastTemplate: DEFAULT_BROADCAST_TEMPLATE,
  confirmationCustomText: "",
  reminderHoursBefore: 24,
};

export type WhatsAppTemplateVariables = Partial<{
  שם_לקוח: string;
  שם_העסק: string;
  קישור_לתיאום: string;
  זמן_תור: string;
  תאריך_תור: string;
  client_name: string;
  business_name: string;
  link: string;
  time: string;
  date: string;
  custom_text: string;
  /** Raw Waze URL; empty if no business address — removed from output when empty. */
  waze_link: string;
  /** Preformatted block for confirmation (newlines + URL); empty without address. */
  confirmation_waze_block: string;
  /** Preformatted “מחכים לראותך” + URL for reminder; empty without address. */
  reminder_waze_block: string;
}>;
