/**
 * E.164 phone normalization for Twilio.
 * Twilio expects numbers like +972501234567 (no spaces, with +).
 */

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Normalize to E.164. Strips spaces/dashes; adds + if missing.
 * Israeli numbers: 050-1234567 -> +972501234567
 */
export function normalizeToE164(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  // Israeli: 10 digits starting with 0 -> +972
  if (digits.length === 10 && digits.startsWith("0")) {
    return "+972" + digits.slice(1);
  }
  if (digits.length === 9 && !digits.startsWith("0")) {
    return "+972" + digits;
  }
  // Already with country code (e.g. 972...)
  if (digits.startsWith("972") && digits.length === 12) {
    return "+" + digits;
  }
  // Generic: assume has country code
  if (!digits.startsWith("+")) return "+" + digits;
  return digits;
}

export function isValidE164(phone: string): boolean {
  const normalized = normalizeToE164(phone);
  return E164_REGEX.test(normalized);
}

/** Format for Twilio "To" field: whatsapp:+972501234567 */
export function toWhatsAppTo(phone: string): string {
  const e164 = normalizeToE164(phone);
  if (!e164) throw new Error("Invalid or empty phone for WhatsApp");
  return "whatsapp:" + e164;
}
