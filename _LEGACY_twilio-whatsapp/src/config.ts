/**
 * Twilio + app config from env. Validates required vars at startup.
 */

import dotenv from "dotenv";

dotenv.config();

export const config = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    /** Messaging Service SID for Content API sends. */
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
    /** Legacy fallback Content SID to avoid freeform sends. */
    legacyContentSid: process.env.TWILIO_TEMPLATE_LEGACY_FALLBACK_CONTENT_SID!,
    /** WhatsApp sender kept only for logs/backward compatibility. */
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM!,
  },
  /** Full URL of this server for Twilio webhook (e.g. https://abc.ngrok.io) */
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || "",
  /** Auth token for Twilio signature validation (from Twilio Console) */
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
};

function ensureWhatsAppFromFormat(from: string): string {
  const trimmed = (from || "").trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  return `whatsapp:${trimmed}`;
}

export function getTwilioWhatsAppFrom(): string {
  const raw = config.twilio.whatsappFrom;
  if (!raw) throw new Error("TWILIO_WHATSAPP_FROM is required");
  return ensureWhatsAppFromFormat(raw);
}

export function validateConfig(): void {
  const { twilio: t } = config;
  if (!t.accountSid || !t.authToken)
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  if (!t.messagingServiceSid) throw new Error("TWILIO_MESSAGING_SERVICE_SID is required");
  if (!t.legacyContentSid)
    throw new Error("TWILIO_TEMPLATE_LEGACY_FALLBACK_CONTENT_SID is required");
}
