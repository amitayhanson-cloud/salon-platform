/**
 * Per-site WhatsApp usage (utility vs service) against a monthly limit. Stored on sites/{siteId}.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";
import { DEFAULT_WHATSAPP_USAGE_LIMIT } from "@/lib/whatsapp/constants";

export { DEFAULT_WHATSAPP_USAGE_LIMIT };

const INBOUND_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type WhatsAppUsageCategory = "utility" | "service";

export type WhatsAppUsageSnapshot = {
  whatsappUtilitySent: number;
  whatsappServiceSent: number;
  whatsappUsageLimit: number;
  whatsappLastUsageResetAt: Timestamp | null;
  totalUsed: number;
};

/** Parse counter from Firestore (number, numeric string, or Integer-like). */
function coerceUsageInt(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  if (raw != null && typeof raw === "object" && "toNumber" in raw && typeof (raw as { toNumber: () => number }).toNumber === "function") {
    try {
      const n = (raw as { toNumber: () => number }).toNumber();
      if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
    } catch {
      /* ignore */
    }
  }
  return 0;
}

function coerceSnapshot(data: Record<string, unknown> | undefined): WhatsAppUsageSnapshot {
  const d = data ?? {};
  const u = coerceUsageInt(d.whatsappUtilitySent);
  const s = coerceUsageInt(d.whatsappServiceSent);
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
  const db = getAdminDb();
  const ref = db.collection("sites").doc(id);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        console.error("[WhatsApp usage] increment skipped: sites doc not found", { siteId: id });
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      const cur = coerceUsageInt(d[field]);
      tx.update(ref, {
        [field]: cur + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[WhatsApp usage] increment failed", { siteId: id, field, error: msg });
    throw e;
  }
}

/** `sites/{siteId}/bookings/{bookingId}` → siteId */
export function siteIdFromBookingRef(ref: string | null | undefined): string | null {
  if (!ref || typeof ref !== "string") return null;
  const m = ref.trim().match(/^sites\/([^/]+)\/bookings\//);
  return m ? m[1]! : null;
}
