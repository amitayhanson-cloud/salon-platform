/**
 * Find a booking created recently where the customer opted in (wa.me) and confirmation was not sent yet.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";
import { getWaOptInPending } from "@/lib/whatsapp/waOptInPending";

/** Customers often send the prefilled wa.me message minutes or hours after booking; keep a generous window. */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
 * Tries wa_opt_in_pending (single doc) first, then collectionGroup query as fallback.
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

  try {
    const pending = await getWaOptInPending(phoneE164, maxAgeMs);
    if (pending) {
      const bookingSnap = await db
        .collection("sites")
        .doc(pending.siteId)
        .collection("bookings")
        .doc(pending.bookingId)
        .get();
      if (bookingSnap.exists) {
        const data = bookingSnap.data() as Record<string, unknown>;
        if (data.confirmationSentAt != null) {
          // Already handled; leave pending for webhook to clear or next booking overwrite
        } else {
          const createdMs = bookingCreatedMs(data);
          if (createdMs != null && now - createdMs <= maxAgeMs) {
            const status = typeof data.status === "string" ? data.status : "";
            if (!status || ["booked", "pending", "confirmed"].includes(status)) {
              return { siteId: pending.siteId, bookingId: pending.bookingId, data };
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[findRecentBookingForWaOptIn] pending_path_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  let snapshot;
  try {
    snapshot = await db.collectionGroup("bookings").where("customerPhoneE164", "==", e164).limit(40).get();
  } catch (e) {
    console.error("[findRecentBookingForWaOptIn] collection_group_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }

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
