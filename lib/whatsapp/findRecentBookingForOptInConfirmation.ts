/**
 * Find a booking created recently where the customer opted in (wa.me) and confirmation was not sent yet.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

function toMillisFromUnknown(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
    try {
      return (v as Timestamp).toMillis();
    } catch {
      return null;
    }
  }
  const sec = (v as { seconds?: number }).seconds;
  if (typeof sec === "number") return sec * 1000;
  return null;
}

function bookingCreatedMs(data: Record<string, unknown>): number | null {
  const server = toMillisFromUnknown(data.createdAt);
  if (server != null) return server;
  const c = data.createdAtClientMs;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  return null;
}

export type RecentOptInBookingMatch = {
  siteId: string;
  bookingId: string;
  data: Record<string, unknown>;
};

/**
 * Most recent matching booking for this phone, within the time window, with opt-in registration and no confirmation timestamp.
 */
export async function findRecentBookingForWaOptInConfirmation(
  phoneE164: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<RecentOptInBookingMatch | null> {
  const stripped = (phoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return null;

  const db = getAdminDb();
  const now = Date.now();
  const snapshot = await db.collectionGroup("bookings").where("customerPhoneE164", "==", e164).limit(40).get();

  let best: { siteId: string; bookingId: string; data: Record<string, unknown>; createdMs: number } | null = null;

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const siteId = doc.ref.parent?.parent?.id ?? "";
    if (!siteId) continue;

    if (data.confirmationSentAt != null) continue;
    if (data.waOptInConfirmationRegisteredAt == null) continue;

    const createdMs = bookingCreatedMs(data);
    if (createdMs == null || now - createdMs > maxAgeMs) continue;

    const status = typeof data.status === "string" ? data.status : "";
    if (status && !["booked", "pending", "confirmed"].includes(status)) continue;

    if (!best || createdMs > best.createdMs) {
      best = { siteId, bookingId: doc.id, data, createdMs };
    }
  }

  if (!best) return null;
  return { siteId: best.siteId, bookingId: best.bookingId, data: best.data };
}
