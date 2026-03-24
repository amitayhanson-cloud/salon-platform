/**
 * Per-site WhatsApp templates & automation toggles.
 * Stored at sites/{siteId}/settings/whatsapp
 */

/** Immediate WhatsApp after online booking vs. customer-initiated thread (wa.me) for Meta cost profile. */
export type PostBookingConfirmationMode = "auto" | "whatsapp_opt_in";

export type WhatsAppSettingsDoc = {
  confirmationEnabled: boolean;
  confirmationTemplate: string;
  /** Free-form paragraph inserted at `{custom_text}` in {@link confirmationTemplate} (optional). */
  confirmationCustomText: string;
  reminderEnabled: boolean;
  reminderTemplate: string;
  /** Free-form paragraph inserted at `{custom_text}` in {@link reminderTemplate} (optional). */
  reminderCustomText: string;
  /** Template for manual broadcaster. */
  broadcastTemplate: string;
  /** Hours before appointment (UI + future scheduling; cron may still use fixed window). */
  reminderHoursBefore: number;
  /** Auto-reply when the customer confirms the appointment via WhatsApp ("כן" / menu). */
  clientConfirmReplyEnabled: boolean;
  clientConfirmReplyTemplate: string;
  /** Inserted at `{custom_text}` before `{waze_link}` in {@link clientConfirmReplyTemplate}. */
  clientConfirmReplyCustomText: string;
  /** Auto-reply when the customer cancels via WhatsApp ("לא" / menu). */
  clientCancelReplyEnabled: boolean;
  clientCancelReplyTemplate: string;
  /** Appended at `{custom_text}` after the main cancel-reply text. */
  clientCancelReplyCustomText: string;
  /**
   * auto: send confirmation WhatsApp right after booking (existing behavior).
   * whatsapp_opt_in: no outbound confirmation until the customer sends the prefilled wa.me message; reply uses the same template in a user-initiated thread.
   */
  postBookingConfirmationMode: PostBookingConfirmationMode;
};

/** Max length for optional automation custom paragraphs (stored per field). */
export const MAX_AUTOMATION_CUSTOM_TEXT_LEN = 700;

export const DEFAULT_CONFIRMATION_TEMPLATE = `היי {client_name}, התור שלך ב-{business_name} בתאריך {date} בשעה {time}.

{custom_text}`;

export const DEFAULT_REMINDER_TEMPLATE = `תזכורת: היי {client_name}, מחכים לך ב-{business_name} בתאריך {date} בשעה {time}.

{custom_text}

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

export const DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE = `אושר ✅ נתראה ב-{time} ב-{business_name}.

{custom_text}

{waze_link}`;

export const DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE = `בוטל ✅. אם תרצו לקבוע מחדש, דברו עם {business_name}.

{custom_text}`;

/** Shown in admin / API errors; validation accepts either tag (see reminderTemplateHasRequiredTime). */
export const REMINDER_REQUIRED_PLACEHOLDER = "{זמן_תור} או {time}";

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsDoc = {
  confirmationEnabled: true,
  confirmationTemplate: DEFAULT_CONFIRMATION_TEMPLATE,
  confirmationCustomText: "",
  reminderEnabled: true,
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  reminderCustomText: "",
  broadcastTemplate: DEFAULT_BROADCAST_TEMPLATE,
  reminderHoursBefore: 24,
  clientConfirmReplyEnabled: true,
  clientConfirmReplyTemplate: DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE,
  clientConfirmReplyCustomText: "",
  clientCancelReplyEnabled: true,
  clientCancelReplyTemplate: DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE,
  clientCancelReplyCustomText: "",
  postBookingConfirmationMode: "auto",
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
