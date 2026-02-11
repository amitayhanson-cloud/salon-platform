/**
 * E.164 phone normalization for Twilio WhatsApp.
 * - Accepts +972… as-is (after stripping non-digits and ensuring + prefix).
 * - Israeli: 05XXXXXXXX -> +9725XXXXXXXX (strip leading 0).
 * - Removes spaces/dashes and returns E.164 string.
 * Use everywhere we read/store phone numbers and when reading Twilio From ("whatsapp:+972…").
 */

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export type DefaultCountry = "IL" | string;

/**
 * Normalize input to E.164. defaultCountry "IL" handles Israeli numbers (05x, 972, etc.).
 */
export function normalizeE164(inputPhone: string, defaultCountry: DefaultCountry = "IL"): string {
  const raw = (inputPhone ?? "").trim().replace(/[\s\-]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";

  if (raw.startsWith("+")) return "+" + digits;

  if (defaultCountry === "IL") {
    if (digits.length === 10 && digits.startsWith("0")) return "+972" + digits.slice(1);
    if (digits.length === 9 && !digits.startsWith("0")) return "+972" + digits;
    if (digits.startsWith("972") && digits.length === 12) return "+" + digits;
  }

  return digits.startsWith("+") ? digits : "+" + digits;
}

/** @deprecated Use normalizeE164(phone, "IL") for consistency. */
export function normalizeToE164(phone: string): string {
  return normalizeE164(phone, "IL");
}

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(normalizeE164(phone, "IL"));
}

/** Twilio "To" field: whatsapp:+972501234567 */
export function toWhatsAppTo(phone: string, defaultCountry: DefaultCountry = "IL"): string {
  const e164 = normalizeE164(phone, defaultCountry);
  if (!e164) throw new Error("Invalid or empty phone for WhatsApp");
  return "whatsapp:" + e164;
}
