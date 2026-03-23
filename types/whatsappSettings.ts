/**
 * Per-site WhatsApp templates & automation toggles.
 * Stored at sites/{siteId}/settings/whatsapp
 */

export type WhatsAppSettingsDoc = {
  confirmationEnabled: boolean;
  confirmationTemplate: string;
  reminderEnabled: boolean;
  reminderTemplate: string;
  /** Hours before appointment (UI + future scheduling; cron may still use fixed window). */
  reminderHoursBefore: number;
};

export const DEFAULT_CONFIRMATION_TEMPLATE = `{שם_העסק} ✂️
תודה שקבעת תור!
התור שלך בתאריך {תאריך_תור} בשעה {זמן_תור}.
נשלח לך תזכורת 24 שעות לפני.`;

export const DEFAULT_REMINDER_TEMPLATE = `{שם_העסק} ✂️
תזכורת: התור שלך מחר בשעה {זמן_תור}.
מגיע/ה?
השב/השיבי:
כן, אגיע
או
לא, בסוף לא אוכל להגיע`;

/** Required in reminder template for validation */
export const REMINDER_REQUIRED_PLACEHOLDER = "{זמן_תור}";

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsDoc = {
  confirmationEnabled: true,
  confirmationTemplate: DEFAULT_CONFIRMATION_TEMPLATE,
  reminderEnabled: true,
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  reminderHoursBefore: 24,
};

export type WhatsAppTemplateVariables = Partial<{
  שם_לקוח: string;
  שם_העסק: string;
  קישור_לתיאום: string;
  זמן_תור: string;
  תאריך_תור: string;
}>;
