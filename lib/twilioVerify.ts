/**
 * Twilio Verify OTP (WhatsApp preferred, SMS fallback).
 * Requires TWILIO_VERIFY_SERVICE_SID from Twilio Console → Verify → Services.
 */
import twilio from "twilio";
import { toWhatsAppTo } from "@/lib/whatsapp/e164";

export type TwilioVerifyConfig = {
  client: ReturnType<typeof twilio>;
  serviceSid: string;
};

export function getTwilioVerifyConfig(): TwilioVerifyConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  return { client: twilio(accountSid, authToken), serviceSid };
}

export async function sendVerificationSms(
  e164: string
): Promise<{ ok: true } | { ok: false; reason: "misconfigured" | "twilio" }> {
  const cfg = getTwilioVerifyConfig();
  if (!cfg) return { ok: false, reason: "misconfigured" };
  try {
    await cfg.client.verify.v2.services(cfg.serviceSid).verifications.create({
      to: e164,
      channel: "sms",
    });
    return { ok: true };
  } catch (e) {
    console.error("[twilioVerify] sendVerificationSms failed", e);
    return { ok: false, reason: "twilio" };
  }
}

/**
 * Preferred: try WhatsApp first, then fallback to SMS.
 *
 * Notes:
 * - Twilio can be configured differently for WhatsApp; we try both "to" formats:
 *   1) plain E.164 number with channel="whatsapp"
 *   2) "whatsapp:+972..." with channel="whatsapp"
 */
export async function sendVerificationOtp(
  e164: string
): Promise<{ ok: true } | { ok: false; reason: "misconfigured" | "twilio" }> {
  const cfg = getTwilioVerifyConfig();
  if (!cfg) return { ok: false, reason: "misconfigured" };

  // 1) WhatsApp with plain E.164
  try {
    await cfg.client.verify.v2.services(cfg.serviceSid).verifications.create({
      to: e164,
      channel: "whatsapp",
    });
    return { ok: true };
  } catch (whatsAppErr1) {
    console.warn("[twilioVerify] sendVerificationOtp whatsapp(plain) failed, fallback:", whatsAppErr1);
  }

  // 2) WhatsApp with "whatsapp:+..."
  try {
    const waTo = toWhatsAppTo(e164);
    await cfg.client.verify.v2.services(cfg.serviceSid).verifications.create({
      to: waTo,
      channel: "whatsapp",
    });
    return { ok: true };
  } catch (whatsAppErr2) {
    console.warn("[twilioVerify] sendVerificationOtp whatsapp(prefix) failed, fallback:", whatsAppErr2);
  }

  // 3) SMS fallback
  return sendVerificationSms(e164);
}

export async function checkVerificationCode(
  e164: string,
  code: string
): Promise<{ ok: true } | { ok: false; reason: "misconfigured" | "twilio" | "invalid" }> {
  const cfg = getTwilioVerifyConfig();
  if (!cfg) return { ok: false, reason: "misconfigured" };
  const digits = code.replace(/\D/g, "");

  // Twilio Verify records may be created with either plain E.164 ("+972...")
  // or whatsapp-prefixed "to" ("whatsapp:+972..."), depending on channel+account config.
  const toCandidates = [e164, toWhatsAppTo(e164)];
  let lastTwilioError: unknown = null;
  let hadSuccessfulCheckResponse = false;

  for (const candidateTo of toCandidates) {
    try {
      const check = await cfg.client.verify.v2.services(cfg.serviceSid).verificationChecks.create({
        to: candidateTo,
        code: digits,
      });
      hadSuccessfulCheckResponse = true;
      if (check.status === "approved") return { ok: true };
    } catch (e) {
      lastTwilioError = e;
    }
  }

  if (hadSuccessfulCheckResponse) return { ok: false, reason: "invalid" };
  console.error("[twilioVerify] checkVerificationCode failed", lastTwilioError);
  return { ok: false, reason: "twilio" };
}
