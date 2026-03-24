/**
 * Per-site WhatsApp usage (utility vs service) against a monthly limit. Stored on sites/{siteId}.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";

export const DEFAULT_WHATSAPP_USAGE_LIMIT = 250;

const INBOUND_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type WhatsAppUsageCategory = "utility" | "service";

export type WhatsAppUsageSnapshot = {
  whatsappUtilitySent: number;
  whatsappServiceSent: number;
  whatsappUsageLimit: number;
  whatsappLastUsageResetAt: Timestamp | null;
  totalUsed: number;
};

function coerceSnapshot(data: Record<string, unknown> | undefined): WhatsAppUsageSnapshot {
  const d = data ?? {};
  const u = typeof d.whatsappUtilitySent === "number" && Number.isFinite(d.whatsappUtilitySent) ? d.whatsappUtilitySent : 0;
  const s = typeof d.whatsappServiceSent === "number" && Number.isFinite(d.whatsappServiceSent) ? d.whatsappServiceSent : 0;
  const limit =
    typeof d.whatsappUsageLimit === "number" && Number.isFinite(d.whatsappUsageLimit) && d.whatsappUsageLimit > 0
      ? Math.floor(d.whatsappUsageLimit)
      : DEFAULT_WHATSAPP_USAGE_LIMIT;
  const last = d.whatsappLastUsageResetAt instanceof Timestamp ? d.whatsappLastUsageResetAt : null;
  return {
    whatsappUtilitySent: Math.max(0, u),
    whatsappServiceSent: Math.max(0, s),
    whatsappUsageLimit: limit,
    whatsappLastUsageResetAt: last,
    totalUsed: Math.max(0, u) + Math.max(0, s),
  };
}

export async function getWhatsAppUsageSnapshot(siteId: string): Promise<WhatsAppUsageSnapshot> {
  const snap = await getAdminDb().collection("sites").doc(siteId.trim()).get();
  return coerceSnapshot(snap.data() as Record<string, unknown> | undefined);
}

export async function assertSiteWithinWhatsAppLimit(siteId: string): Promise<{
  allowed: boolean;
  snapshot: WhatsAppUsageSnapshot;
}> {
  const snapshot = await getWhatsAppUsageSnapshot(siteId);
  return { allowed: snapshot.totalUsed < snapshot.whatsappUsageLimit, snapshot };
}

/**
 * Outbound Twilio path: if the customer messaged us in the last 24h, count as service; else utility (template / cold).
 */
export async function resolveOutboundUsageCategory(toE164: string): Promise<WhatsAppUsageCategory> {
  const inbound = await hasInboundFromCustomerInLast24Hours(toE164);
  return inbound ? "service" : "utility";
}

function normalizeStoredFromPhone(fromPhone: string): string {
  const raw = (fromPhone ?? "").trim();
  const stripped = raw.replace(/^whatsapp:/i, "");
  return normalizeE164(stripped, "IL");
}

export async function hasInboundFromCustomerInLast24Hours(toE164: string): Promise<boolean> {
  const target = normalizeE164(toE164, "IL");
  if (!target) return false;

  const db = getAdminDb();
  const since = Timestamp.fromMillis(Date.now() - INBOUND_LOOKBACK_MS);
  const snap = await db
    .collection("whatsapp_messages")
    .where("direction", "==", "inbound")
    .where("createdAt", ">=", since)
    .limit(400)
    .get();

  for (const doc of snap.docs) {
    const from = String(doc.data().fromPhone ?? "");
    const norm = normalizeStoredFromPhone(from);
    if (norm && norm === target) return true;
  }
  return false;
}

export async function incrementWhatsAppUsage(siteId: string, category: WhatsAppUsageCategory): Promise<void> {
  const id = siteId.trim();
  if (!id) return;
  const field = category === "utility" ? "whatsappUtilitySent" : "whatsappServiceSent";
  await getAdminDb()
    .collection("sites")
    .doc(id)
    .update({
      [field]: FieldValue.increment(1),
    });
}

/** `sites/{siteId}/bookings/{bookingId}` → siteId */
export function siteIdFromBookingRef(ref: string | null | undefined): string | null {
  if (!ref || typeof ref !== "string") return null;
  const m = ref.trim().match(/^sites\/([^/]+)\/bookings\//);
  return m ? m[1]! : null;
}
