/**
 * Build wa.me link for “send me confirmation” from the public booking success page (server-only).
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";

function digitsFromTwilioFrom(): string | null {
  const raw = process.env.TWILIO_WHATSAPP_FROM?.trim() || "";
  const m = raw.replace(/^whatsapp:/i, "").match(/\+?(\d[\d\s-]{5,})/);
  if (!m) return null;
  return m[1]!.replace(/\D/g, "");
}

function buildPrefillBody(params: { businessName: string; timeLabel: string }): string {
  const joinCode = (process.env.TWILIO_WHATSAPP_SANDBOX_JOIN_CODE ?? "").trim();
  const sandbox = (process.env.TWILIO_WHATSAPP_SANDBOX_MODE ?? "").toLowerCase() === "true";
  const prefix = sandbox && joinCode ? `join ${joinCode}\n\n` : "";
  return `${prefix}היי ${params.businessName}, אשמח לקבל אישור ופרטי הגעה לתור שלי ב-${params.timeLabel}.`;
}

export async function buildBookingSuccessWhatsAppOptInUrl(params: {
  siteId: string;
  businessName: string;
  /** Display time for the prefill, e.g. slot label from the booking UI */
  timeLabel: string;
}): Promise<string | null> {
  const sandbox = (process.env.TWILIO_WHATSAPP_SANDBOX_MODE ?? "").toLowerCase() === "true";
  let phoneDigits: string | null = null;
  if (sandbox) {
    phoneDigits = digitsFromTwilioFrom();
  } else {
    const snap = await getAdminDb().collection("sites").doc(params.siteId.trim()).get();
    const cfg = snap.data()?.config as { whatsappNumber?: string; phoneNumber?: string } | undefined;
    const raw = String(cfg?.whatsappNumber ?? cfg?.phoneNumber ?? "").trim();
    if (!raw) return null;
    const e164 = normalizeE164(raw, "IL");
    if (!e164) return null;
    phoneDigits = e164.replace(/^\+/, "");
  }
  if (!phoneDigits) return null;
  const text = buildPrefillBody({
    businessName: params.businessName.trim() || "העסק",
    timeLabel: params.timeLabel.trim() || "—",
  });
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}
