/**
 * Fast path for WhatsApp opt-in confirmation: single-doc lookup by E.164.
 * Avoids collectionGroup("bookings") queries that may lack indexes or fail in production.
 * Written when the customer completes booking (opt-in mode); cleared after confirmation is sent.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";

const COLLECTION = "wa_opt_in_pending";

/** Stable Firestore doc id from E.164 (digits only, prefixed). */
export function waOptInPendingDocIdFromE164(e164: string): string {
  const digits = (e164 ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? `p${digits}` : "";
}

export async function setWaOptInPending(params: {
  customerPhoneE164: string;
  siteId: string;
  bookingId: string;
}): Promise<void> {
  const id = waOptInPendingDocIdFromE164(params.customerPhoneE164);
  if (!id) return;
  const db = getAdminDb();
  await db.collection(COLLECTION).doc(id).set({
    siteId: params.siteId.trim(),
    bookingId: params.bookingId.trim(),
    registeredAt: Timestamp.now(),
    customerPhoneE164: params.customerPhoneE164.trim(),
  });
}

export async function getWaOptInPending(
  phoneE164Raw: string,
  maxAgeMs: number
): Promise<{ siteId: string; bookingId: string } | null> {
  const stripped = (phoneE164Raw || "").trim().replace(/^whatsapp:/i, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return null;
  const id = waOptInPendingDocIdFromE164(e164);
  if (!id) return null;
  const snap = await getAdminDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  const reg = d.registeredAt;
  const regMs =
    reg instanceof Timestamp
      ? reg.toMillis()
      : typeof (reg as { seconds?: number })?.seconds === "number"
        ? (reg as { seconds: number }).seconds * 1000
        : 0;
  if (!regMs || Date.now() - regMs > maxAgeMs) return null;
  const siteId = typeof d.siteId === "string" ? d.siteId.trim() : "";
  const bookingId = typeof d.bookingId === "string" ? d.bookingId.trim() : "";
  if (!siteId || !bookingId) return null;
  return { siteId, bookingId };
}

export async function clearWaOptInPending(phoneE164Raw: string): Promise<void> {
  const stripped = (phoneE164Raw || "").trim().replace(/^whatsapp:/i, "");
  const e164 = normalizeE164(stripped, "IL");
  const id = waOptInPendingDocIdFromE164(e164);
  if (!id) return;
  await getAdminDb().collection(COLLECTION).doc(id).delete();
}
