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
  /** Hours before appointment (UI + future scheduling; cron may still use fixed window). */
  reminderHoursBefore: number;
  /** Auto-reply when the customer confirms the appointment via WhatsApp ("כן" / menu). */
  clientConfirmReplyEnabled: boolean;
  clientConfirmReplyTemplate: string;
  /** Auto-reply when the customer cancels via WhatsApp ("לא" / menu). */
  clientCancelReplyEnabled: boolean;
  clientCancelReplyTemplate: string;
};

export const DEFAULT_CONFIRMATION_TEMPLATE =
  "היי {client_name}, התור שלך ב-{business_name} בתאריך {date} בשעה {time}.\n{waze_link}";

export const DEFAULT_REMINDER_TEMPLATE = `תזכורת: היי {client_name}, מחכים לך ב-{business_name} בתאריך {date} בשעה {time}.

מגיעים? השיבו להודעה זו:
כן, אגיע
או
לא, נא לבטל`;

/** Manual broadcast: fixed wording; only `{custom_text}` is free-form from the admin. */
export const DEFAULT_BROADCAST_TEMPLATE =
  "היי {client_name}, הודעה מ-{business_name}, {custom_text}. לחצו כאן לפרטים: {link}";

/** Previous default — migrated to {@link DEFAULT_BROADCAST_TEMPLATE} in normalize (read path). */
export const LEGACY_BROADCAST_TEMPLATE_V1 =
  "היי {client_name}! הודעה מ-{business_name}: {custom_text}. לפרטים: {link}";

export const DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE =
  "אושר ✅ נתראה ב-{time} ב-{business_name}.\n{waze_link}";

export const DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE =
  "בוטל ✅. אם תרצה/י לקבוע מחדש, דבר/י עם {business_name}.";

/** Shown in admin / API errors; validation accepts either tag (see reminderTemplateHasRequiredTime). */
export const REMINDER_REQUIRED_PLACEHOLDER = "{זמן_תור} או {time}";

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsDoc = {
  confirmationEnabled: true,
  confirmationTemplate: DEFAULT_CONFIRMATION_TEMPLATE,
  reminderEnabled: true,
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  broadcastTemplate: DEFAULT_BROADCAST_TEMPLATE,
  reminderHoursBefore: 24,
  clientConfirmReplyEnabled: true,
  clientConfirmReplyTemplate: DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE,
  clientCancelReplyEnabled: true,
  clientCancelReplyTemplate: DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE,
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
  /** Waze navigation URL from business address; empty omits tag from message. */
  waze_link: string;
}>;
