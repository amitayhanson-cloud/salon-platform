/**
 * Meta-approved Twilio Content template SIDs (synced from Content Builder).
 *
 * Env resolution: Vercel-style `*_V2_CONTENT_SID` first, optional `*_CONTENT_SID_V2`, then legacy
 * names without `_V2`, then defaults below.
 *
 * Variable shapes (must match send-time validation in send.ts):
 * - appointment_reminder_v1: body {{1}}–{{4}} only
 * - booking_confirmed: body {{1}}–{{4}} only
 * - broadcast_message_v1: body {{1}}–{{3}} + dynamic URL button (e.g. button_1["1"])
 */

export type TwilioWhatsAppTemplateKind =
  | "booking_confirmed"
  | "appointment_reminder_v1"
  | "broadcast_message_v1";

const ENV_KEYS: Record<
  TwilioWhatsAppTemplateKind,
  { v2Primary: string; v2Alt: string; legacy: string }
> = {
  booking_confirmed: {
    v2Primary: "TWILIO_TEMPLATE_BOOKING_CONFIRMED_V2_CONTENT_SID",
    v2Alt: "TWILIO_TEMPLATE_BOOKING_CONFIRMED_CONTENT_SID_V2",
    legacy: "TWILIO_TEMPLATE_BOOKING_CONFIRMED_CONTENT_SID",
  },
  appointment_reminder_v1: {
    v2Primary: "TWILIO_TEMPLATE_APPOINTMENT_REMINDER_V2_CONTENT_SID",
    v2Alt: "TWILIO_TEMPLATE_APPOINTMENT_REMINDER_V1_CONTENT_SID_V2",
    legacy: "TWILIO_TEMPLATE_APPOINTMENT_REMINDER_V1_CONTENT_SID",
  },
  broadcast_message_v1: {
    v2Primary: "TWILIO_TEMPLATE_BROADCAST_MESSAGE_V2_CONTENT_SID",
    v2Alt: "TWILIO_TEMPLATE_BROADCAST_MESSAGE_V1_CONTENT_SID_V2",
    legacy: "TWILIO_TEMPLATE_BROADCAST_MESSAGE_V1_CONTENT_SID",
  },
};

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** SID from env only (no built-in default). Prefer `*_V2_CONTENT_SID`, then `*_CONTENT_SID_V2`, then legacy. */
export function getTwilioTemplateContentSidFromEnv(kind: TwilioWhatsAppTemplateKind): string | undefined {
  const { v2Primary, v2Alt, legacy } = ENV_KEYS[kind];
  return envTrim(v2Primary) ?? envTrim(v2Alt) ?? envTrim(legacy);
}

/** Env if set, else built-in default SID for this template. */
export function resolveTwilioTemplateContentSid(kind: TwilioWhatsAppTemplateKind): string {
  return (
    getTwilioTemplateContentSidFromEnv(kind) ??
    (kind === "booking_confirmed"
      ? BOOKING_CONFIRMED_SID
      : kind === "appointment_reminder_v1"
        ? APPOINTMENT_REMINDER_SID
        : BROADCAST_SID)
  );
}

export const APPOINTMENT_REMINDER_SID = "HX701eb4fc7a0c0c9d0cd1819560662fa2";

export const BOOKING_CONFIRMED_SID = "HX6fc2713d6b7e1ce895e442686413dfd8";

export const BROADCAST_SID = "HXe1d69e6b126c9bd073e3065fc648f762";

/** @deprecated Use APPOINTMENT_REMINDER_SID — kept for string search parity with older docs. */
export const APPOINTMENT_REMINDER_CONTENT_SID = APPOINTMENT_REMINDER_SID;

/** @deprecated Use BOOKING_CONFIRMED_SID */
export const BOOKING_CONFIRMED_CONTENT_SID = BOOKING_CONFIRMED_SID;

/** @deprecated Use BROADCAST_SID */
export const BROADCAST_MESSAGE_CONTENT_SID = BROADCAST_SID;
