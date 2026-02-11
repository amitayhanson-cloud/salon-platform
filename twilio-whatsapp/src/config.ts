/**
 * Twilio + app config from env. Validates required vars at startup.
 */

import dotenv from "dotenv";

dotenv.config();

export const config = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    /** WhatsApp sender: "whatsapp:+14155238886" (sandbox) or your prod number */
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
  if (!t.whatsappFrom)
    throw new Error("TWILIO_WHATSAPP_FROM is required (e.g. whatsapp:+14155238886)");
}
