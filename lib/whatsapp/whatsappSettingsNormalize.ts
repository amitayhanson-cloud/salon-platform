/**
 * Client + server safe: normalize Firestore `settings/whatsapp` documents.
 */

import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import {
  DEFAULT_WHATSAPP_SETTINGS,
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_BROADCAST_TEMPLATE,
  LEGACY_BROADCAST_TEMPLATE_V1,
  DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE,
  DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE,
} from "@/types/whatsappSettings";

function clampHours(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_WHATSAPP_SETTINGS.reminderHoursBefore;
  return Math.min(168, Math.max(1, Math.floor(x)));
}

/** Legacy: confirmation no longer supports `{custom_text}`; strip if present. */
export function stripConfirmationCustomTextPlaceholder(template: string): string {
  return template
    .replace(/\n+\{custom_text\}\s*$/u, "")
    .replace(/\{custom_text\}\s*/gu, "")
    .trimEnd();
}

export function normalizeWhatsAppSettingsDoc(raw: Record<string, unknown> | undefined): WhatsAppSettingsDoc {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WHATSAPP_SETTINGS };
  }
  return {
    confirmationEnabled:
      typeof raw.confirmationEnabled === "boolean" ? raw.confirmationEnabled : DEFAULT_WHATSAPP_SETTINGS.confirmationEnabled,
    confirmationTemplate: (() => {
      const t =
        typeof raw.confirmationTemplate === "string" && raw.confirmationTemplate.trim()
          ? raw.confirmationTemplate
          : DEFAULT_CONFIRMATION_TEMPLATE;
      return stripConfirmationCustomTextPlaceholder(t);
    })(),
    reminderEnabled:
      typeof raw.reminderEnabled === "boolean" ? raw.reminderEnabled : DEFAULT_WHATSAPP_SETTINGS.reminderEnabled,
    reminderTemplate:
      typeof raw.reminderTemplate === "string" && raw.reminderTemplate.trim()
        ? raw.reminderTemplate
        : DEFAULT_REMINDER_TEMPLATE,
    broadcastTemplate: (() => {
      const t = typeof raw.broadcastTemplate === "string" ? raw.broadcastTemplate.trim() : "";
      if (!t) return DEFAULT_BROADCAST_TEMPLATE;
      if (t === LEGACY_BROADCAST_TEMPLATE_V1) return DEFAULT_BROADCAST_TEMPLATE;
      return t;
    })(),
    reminderHoursBefore: clampHours(raw.reminderHoursBefore),
    clientConfirmReplyEnabled:
      typeof raw.clientConfirmReplyEnabled === "boolean"
        ? raw.clientConfirmReplyEnabled
        : DEFAULT_WHATSAPP_SETTINGS.clientConfirmReplyEnabled,
    clientConfirmReplyTemplate:
      typeof raw.clientConfirmReplyTemplate === "string" && raw.clientConfirmReplyTemplate.trim()
        ? raw.clientConfirmReplyTemplate
        : DEFAULT_CLIENT_CONFIRM_REPLY_TEMPLATE,
    clientCancelReplyEnabled:
      typeof raw.clientCancelReplyEnabled === "boolean"
        ? raw.clientCancelReplyEnabled
        : DEFAULT_WHATSAPP_SETTINGS.clientCancelReplyEnabled,
    clientCancelReplyTemplate:
      typeof raw.clientCancelReplyTemplate === "string" && raw.clientCancelReplyTemplate.trim()
        ? raw.clientCancelReplyTemplate
        : DEFAULT_CLIENT_CANCEL_REPLY_TEMPLATE,
  };
}
