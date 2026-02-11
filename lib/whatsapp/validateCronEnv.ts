/**
 * Validate required env vars for WhatsApp reminder cron.
 * Fail loudly with a clear error message so production issues are obvious.
 */

export type ValidateCronEnvResult =
  | { ok: true }
  | { ok: false; error: string; code: string };

const ROUTE = "/api/cron/whatsapp-reminders";

export function validateCronEnv(): ValidateCronEnvResult {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.trim() === "") {
    return {
      ok: false,
      error: "CRON_SECRET is missing. Set it in Vercel Environment Variables and use ?secret=CRON_SECRET when calling the cron endpoint.",
      code: "CRON_SECRET_MISSING",
    };
  }
  if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
    return {
      ok: false,
      error: "TWILIO_ACCOUNT_SID is missing. Required for sending WhatsApp reminders.",
      code: "TWILIO_ACCOUNT_SID_MISSING",
    };
  }
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
    return {
      ok: false,
      error: "TWILIO_AUTH_TOKEN is missing. Required for sending WhatsApp reminders.",
      code: "TWILIO_AUTH_TOKEN_MISSING",
    };
  }
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!from) {
    return {
      ok: false,
      error: "TWILIO_WHATSAPP_FROM is missing (e.g. whatsapp:+14155238886). Required for sending WhatsApp reminders.",
      code: "TWILIO_WHATSAPP_FROM_MISSING",
    };
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() && !process.env.FIREBASE_PROJECT_ID?.trim()) {
    return {
      ok: false,
      error: "Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) in Vercel.",
      code: "FIREBASE_CREDS_MISSING",
    };
  }
  return { ok: true };
}
