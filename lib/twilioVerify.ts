/**
 * Twilio Verify (SMS OTP). Used for platform signup/login.
 * Requires TWILIO_VERIFY_SERVICE_SID from Twilio Console → Verify → Services.
 */
import twilio from "twilio";

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

export async function sendVerificationSms(e164: string): Promise<{ ok: true } | { ok: false; reason: "misconfigured" | "twilio" }> {
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

export async function checkVerificationCode(
  e164: string,
  code: string
): Promise<{ ok: true } | { ok: false; reason: "misconfigured" | "twilio" | "invalid" }> {
  const cfg = getTwilioVerifyConfig();
  if (!cfg) return { ok: false, reason: "misconfigured" };
  try {
    const check = await cfg.client.verify.v2.services(cfg.serviceSid).verificationChecks.create({
      to: e164,
      code: code.replace(/\D/g, ""),
    });
    if (check.status === "approved") return { ok: true };
    return { ok: false, reason: "invalid" };
  } catch (e) {
    console.error("[twilioVerify] checkVerificationCode failed", e);
    return { ok: false, reason: "twilio" };
  }
}
