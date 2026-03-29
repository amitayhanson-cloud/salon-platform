/**
 * Client + server safe: normalize Firestore `settings/whatsapp` documents.
 */

import type { PostBookingConfirmationMode, WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import {
  DEFAULT_WHATSAPP_SETTINGS,
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_BROADCAST_TEMPLATE,
  LEGACY_BROADCAST_TEMPLATE_V1,
  LEGACY_BROADCAST_TEMPLATE_V2,
  LEGACY_CONFIRMATION_TEMPLATE_V1,
  LEGACY_REMINDER_TEMPLATE_V1,
  DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE,
  DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE,
  MAX_AUTOMATION_CUSTOM_TEXT_LEN,
} from "@/types/whatsappSettings";

function clampHours(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_WHATSAPP_SETTINGS.reminderHoursBefore;
  return Math.min(168, Math.max(1, Math.floor(x)));
}

export function clampAutomationCustomText(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  return t.length > MAX_AUTOMATION_CUSTOM_TEXT_LEN ? t.slice(0, MAX_AUTOMATION_CUSTOM_TEXT_LEN) : t;
}

/** Keeps confirmation template without Waze; ensures `{custom_text}` exists once. */
export function ensureConfirmationCustomSlot(template: string): string {
  const t = template.trim();
  if (!t) return DEFAULT_CONFIRMATION_TEMPLATE;
  const withoutWaze = t
    .replace(/\{waze_link\}/gu, "")
    .replace(/\{קישור_וויז\}/gu, "")
    .replace(/\{confirmation_waze_block\}/gu, "")
    .replace(/\{בלוק_וויז_אישור\}/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!withoutWaze) return DEFAULT_CONFIRMATION_TEMPLATE;
  if (withoutWaze.includes("{custom_text}")) return withoutWaze;
  return `${withoutWaze}\n\n{custom_text}`;
}

/** Inserts `{custom_text}` before the "מגיעים?" prompt block. Idempotent if already present. */
export function ensureReminderCustomSlot(template: string): string {
  const t = template.trim();
  if (!t) return DEFAULT_REMINDER_TEMPLATE;
  if (t.includes("{custom_text}")) return t;
  const marker = "מגיעים?";
  const idx = t.indexOf(marker);
  if (idx !== -1) {
    const before = t.slice(0, idx).trimEnd();
    const after = t.slice(idx).trimStart();
    return `${before}\n\n{custom_text}\n\n${after}`;
  }
  return `${t}\n\n{custom_text}`;
}

export function ensureClientConfirmCustomSlot(template: string): string {
  const t = template.trim();
  if (!t) return DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE;
  if (t.includes("{custom_text}")) return t;
  if (t.includes("{waze_link}")) {
    return t.replace(/\{waze_link\}/u, "\n\n{custom_text}\n\n{waze_link}");
  }
  return `${t}\n\n{custom_text}\n\n{waze_link}`;
}

export function ensureClientCancelCustomSlot(template: string): string {
  const t = template.trim();
  if (!t) return DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE;
  if (t.includes("{custom_text}")) return t;
  return `${t}\n\n{custom_text}`;
}

export function normalizeWhatsAppSettingsDoc(raw: Record<string, unknown> | undefined): WhatsAppSettingsDoc {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WHATSAPP_SETTINGS };
  }
  const rawConfirmation =
    typeof raw.confirmationTemplate === "string" && raw.confirmationTemplate.trim()
      ? raw.confirmationTemplate.trim()
      : DEFAULT_CONFIRMATION_TEMPLATE;
  const confirmationBase =
    rawConfirmation === LEGACY_CONFIRMATION_TEMPLATE_V1 ? DEFAULT_CONFIRMATION_TEMPLATE : rawConfirmation;
  const rawReminder =
    typeof raw.reminderTemplate === "string" && raw.reminderTemplate.trim()
      ? raw.reminderTemplate.trim()
      : DEFAULT_REMINDER_TEMPLATE;
  const reminderBase = rawReminder === LEGACY_REMINDER_TEMPLATE_V1 ? DEFAULT_REMINDER_TEMPLATE : rawReminder;
  return {
    confirmationEnabled:
      typeof raw.confirmationEnabled === "boolean" ? raw.confirmationEnabled : DEFAULT_WHATSAPP_SETTINGS.confirmationEnabled,
    confirmationTemplate: ensureConfirmationCustomSlot(confirmationBase),
    confirmationCustomText: clampAutomationCustomText(raw.confirmationCustomText, ""),
    reminderEnabled:
      typeof raw.reminderEnabled === "boolean" ? raw.reminderEnabled : DEFAULT_WHATSAPP_SETTINGS.reminderEnabled,
    reminderTemplate: ensureReminderCustomSlot(reminderBase),
    reminderCustomText: clampAutomationCustomText(raw.reminderCustomText, ""),
    broadcastTemplate: (() => {
      const t = typeof raw.broadcastTemplate === "string" ? raw.broadcastTemplate.trim() : "";
      if (!t) return DEFAULT_BROADCAST_TEMPLATE;
      if (t === LEGACY_BROADCAST_TEMPLATE_V1 || t === LEGACY_BROADCAST_TEMPLATE_V2) {
        return DEFAULT_BROADCAST_TEMPLATE;
      }
      return t;
    })(),
    reminderHoursBefore: clampHours(raw.reminderHoursBefore),
    clientConfirmReplyEnabled:
      typeof raw.clientConfirmReplyEnabled === "boolean"
        ? raw.clientConfirmReplyEnabled
        : DEFAULT_WHATSAPP_SETTINGS.clientConfirmReplyEnabled,
    clientConfirmReplyTemplate: ensureClientConfirmCustomSlot(
      typeof raw.clientConfirmReplyTemplate === "string" && raw.clientConfirmReplyTemplate.trim()
        ? raw.clientConfirmReplyTemplate
        : DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE
    ),
    clientConfirmReplyCustomText: clampAutomationCustomText(raw.clientConfirmReplyCustomText, ""),
    clientCancelReplyEnabled:
      typeof raw.clientCancelReplyEnabled === "boolean"
        ? raw.clientCancelReplyEnabled
        : DEFAULT_WHATSAPP_SETTINGS.clientCancelReplyEnabled,
    clientCancelReplyTemplate: ensureClientCancelCustomSlot(
      typeof raw.clientCancelReplyTemplate === "string" && raw.clientCancelReplyTemplate.trim()
        ? raw.clientCancelReplyTemplate
        : DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE
    ),
    clientCancelReplyCustomText: clampAutomationCustomText(raw.clientCancelReplyCustomText, ""),
    postBookingConfirmationMode: ((): PostBookingConfirmationMode => {
      const v = raw.postBookingConfirmationMode;
      if (v === "whatsapp_opt_in" || v === "auto") return v;
      return DEFAULT_WHATSAPP_SETTINGS.postBookingConfirmationMode;
    })(),
  };
}
