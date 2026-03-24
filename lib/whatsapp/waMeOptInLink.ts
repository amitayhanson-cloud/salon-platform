/**
 * Build wa.me link for “send me confirmation” from the public booking success page (server-only).
 *
 * Important: the customer must open a chat with the **Twilio WhatsApp business number** (same as
 * TWILIO_WHATSAPP_FROM), because inbound messages hit `/api/webhooks/twilio/whatsapp` and trigger
 * the opt-in confirmation reply. That is **not** the same as the salon’s public contact WhatsApp in
 * site config (used for “contact us” on the marketing site).
 */

function digitsFromTwilioFrom(): string | null {
  const raw = process.env.TWILIO_WHATSAPP_FROM?.trim() || "";
  const m = raw.replace(/^whatsapp:/i, "").match(/\+?(\d[\d\s-]{5,})/);
  if (!m) return null;
  return m[1]!.replace(/\D/g, "");
}

function buildPrefillBody(params: { businessName: string; timeLabel: string }): string {
  const joinCode = (process.env.TWILIO_WHATSAPP_SANDBOX_JOIN_CODE ?? "").trim();
  const sandbox = (process.env.TWILIO_WHATSAPP_SANDBOX_MODE ?? "").toLowerCase() === "true";
  // Sandbox requires "join <code>" so the customer can message the Twilio sandbox number first.
  const prefix = sandbox && joinCode ? `join ${joinCode}\n\n` : "";
  return `${prefix}היי ${params.businessName}, אשמח לקבל אישור ופרטי הגעה לתור שלי ב-${params.timeLabel}.`;
}

/**
 * Always targets the platform Twilio WhatsApp number so the webhook can reply.
 * `siteId` is kept for API stability; business name in the prefill still identifies the salon.
 */
export function buildBookingSuccessWhatsAppOptInUrl({
  siteId: _siteId,
  businessName,
  timeLabel,
}: {
  siteId: string;
  businessName: string;
  /** Display time for the prefill, e.g. slot label from the booking UI */
  timeLabel: string;
}): string | null {
  const sandbox = (process.env.TWILIO_WHATSAPP_SANDBOX_MODE ?? "").toLowerCase() === "true";
  const joinCode = (process.env.TWILIO_WHATSAPP_SANDBOX_JOIN_CODE ?? "").trim();
  if (sandbox && !joinCode) {
    return null;
  }

  const phoneDigits = digitsFromTwilioFrom();
  if (!phoneDigits) return null;
  const text = buildPrefillBody({
    businessName: businessName.trim() || "העסק",
    timeLabel: timeLabel.trim() || "—",
  });
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}
