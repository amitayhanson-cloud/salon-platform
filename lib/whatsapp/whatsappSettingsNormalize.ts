/**
 * Client + server safe: normalize Firestore `settings/whatsapp` documents.
 */

import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import {
  DEFAULT_WHATSAPP_SETTINGS,
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
} from "@/types/whatsappSettings";

function clampHours(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_WHATSAPP_SETTINGS.reminderHoursBefore;
  return Math.min(168, Math.max(1, Math.floor(x)));
}

export function normalizeWhatsAppSettingsDoc(raw: Record<string, unknown> | undefined): WhatsAppSettingsDoc {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WHATSAPP_SETTINGS };
  }
  return {
    confirmationEnabled:
      typeof raw.confirmationEnabled === "boolean" ? raw.confirmationEnabled : DEFAULT_WHATSAPP_SETTINGS.confirmationEnabled,
    confirmationTemplate:
      typeof raw.confirmationTemplate === "string" && raw.confirmationTemplate.trim()
        ? raw.confirmationTemplate
        : DEFAULT_CONFIRMATION_TEMPLATE,
    reminderEnabled:
      typeof raw.reminderEnabled === "boolean" ? raw.reminderEnabled : DEFAULT_WHATSAPP_SETTINGS.reminderEnabled,
    reminderTemplate:
      typeof raw.reminderTemplate === "string" && raw.reminderTemplate.trim()
        ? raw.reminderTemplate
        : DEFAULT_REMINDER_TEMPLATE,
    reminderHoursBefore: clampHours(raw.reminderHoursBefore),
  };
}
