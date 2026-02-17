/**
 * Cascade cancel/archive: when ANY booking in a multi-part set is cancelled,
 * ALL bookings "booked together" must be cancelled/archived the same way.
 * Uses existing grouping (visitGroupId/parentBookingId) or safe heuristic (same customer + createdAt window).
 * Does NOT change booking creation, scheduling, or calendar logic.
 */

import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";
import { MAX_RELATED_BOOKINGS } from "@/lib/whatsapp/relatedBookings";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

/** Hard cap for cascade (heuristic path). */
export const CASCADE_CAP = 10;

export type CascadeCancelReason = "manual" | "auto" | "customer_cancelled_via_whatsapp";

/**
 * Resolve all booking IDs that must be cancelled together when one is cancelled.
 * 1) If explicit grouping exists (visitGroupId/bookingGroupId/parentBookingId): return all in that group.
 * 2) Else: heuristic — same site, same customer, createdAt within ±2 min, same booking date; cap at CASCADE_CAP.
 */
export async function resolveRelatedBookingIdsToCascadeCancel(
  siteId: string,
  bookingId: string
): Promise<string[]> {
  const explicit = await getRelatedBookingIds(siteId, bookingId);
  if (explicit.bookingIds.length > 1) {
    return explicit.bookingIds.slice(0, MAX_RELATED_BOOKINGS);
  }

  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) {
    return [bookingId];
  }
  const data = snap.data()!;
  const customerId =
    (data.customerPhoneE164 as string)?.trim() ||
    (data.clientId as string)?.trim() ||
    (data.customerPhone as string)?.trim() ||
    (data.phone as string)?.trim() ||
    "";
  const dateStr = (data.dateISO as string) ?? (data.date as string) ?? "";
  const createdAt = data.createdAt as admin.firestore.Timestamp | undefined;
  if (!customerId || !createdAt) {
    return [bookingId];
  }
  const t = createdAt.toMillis ? createdAt.toMillis() : (createdAt as { seconds?: number }).seconds! * 1000;
  const twoMin = 2 * 60 * 1000;
  const low = new Date(t - twoMin);
  const high = new Date(t + twoMin);
  const lowTs = admin.firestore.Timestamp.fromDate(low);
  const highTs = admin.firestore.Timestamp.fromDate(high);

  const col = db.collection("sites").doc(siteId).collection("bookings");
  const windowQuery = col
    .where("createdAt", ">=", lowTs)
    .where("createdAt", "<=", highTs)
    .limit(21)
    .get();
  const snapshot = await windowQuery;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const doc of snapshot.docs) {
    if (ids.length >= CASCADE_CAP) break;
    const d = doc.data();
    const docCustomer =
      (d.customerPhoneE164 as string)?.trim() ||
      (d.clientId as string)?.trim() ||
      (d.customerPhone as string)?.trim() ||
      (d.phone as string)?.trim() ||
      "";
    const docDate = (d.dateISO as string) ?? (d.date as string) ?? "";
    const sameCustomer = docCustomer === customerId;
    const sameDate = !dateStr || !docDate || docDate === dateStr;
    if (sameCustomer && sameDate && !seen.has(doc.id)) {
      seen.add(doc.id);
      ids.push(doc.id);
    }
  }
  if (ids.length === 0) return [bookingId];
  return ids;
}

/** Optional fields when admin cancels (manual); applied to all group members. */
export type AdminCancelOptions = {
  cancellationReason?: string | null;
  cancelledBy?: string | null;
};

/**
 * Apply cancel/archive to all given booking IDs in one batch.
 * Idempotent: skips docs that are already archived. No hard-delete.
 * For reason "manual", pass options to set cancellationReason and cancelledBy on all members.
 */
export async function cancelBookingsCascade(
  siteId: string,
  bookingIds: string[],
  reason: CascadeCancelReason,
  adminOptions?: AdminCancelOptions
): Promise<{ successCount: number; failCount: number }> {
  if (bookingIds.length === 0) {
    return { successCount: 0, failCount: 0 };
  }
  const db = getAdminDb();
  const isWhatsApp = reason === "customer_cancelled_via_whatsapp";
  const base: Record<string, unknown> = isWhatsApp
    ? {
        whatsappStatus: "cancelled" as const,
        status: "cancelled" as const,
        cancelledAt: serverTimestamp(),
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedReason: "customer_cancelled_via_whatsapp" as const,
        updatedAt: serverTimestamp(),
      }
    : {
        status: "cancelled" as const,
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedReason: reason,
        updatedAt: serverTimestamp(),
      };
  const payload: Record<string, unknown> = { ...base };
  if (reason === "manual" && adminOptions) {
    if (adminOptions.cancellationReason != null && adminOptions.cancellationReason !== "") {
      payload.cancellationReason = adminOptions.cancellationReason;
    }
    if (adminOptions.cancelledBy != null && adminOptions.cancelledBy !== "") {
      payload.cancelledBy = adminOptions.cancelledBy;
    }
    payload.cancelledAt = serverTimestamp();
  }

  const toUpdate: { ref: admin.firestore.DocumentReference; statusAtArchive: string }[] = [];
  for (const id of bookingIds) {
    const ref = db.collection("sites").doc(siteId).collection("bookings").doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    if ((snap.data() as { isArchived?: boolean })?.isArchived === true) continue;
    const d = snap.data() as { status?: string };
    const statusAtArchive = (d?.status != null && String(d.status).trim()) ? String(d.status).trim() : "booked";
    toUpdate.push({ ref, statusAtArchive });
  }
  if (toUpdate.length === 0) {
    return { successCount: 0, failCount: 0 };
  }
  const batch = db.batch();
  for (const { ref, statusAtArchive } of toUpdate) {
    const finalPayload = { ...payload, statusAtArchive };
    if (process.env.NODE_ENV !== "production") {
      console.log("ARCHIVE PAYLOAD", { bookingId: ref.id, statusAtArchive, payloadKeys: Object.keys(finalPayload) });
    }
    batch.update(ref, finalPayload);
  }
  try {
    await batch.commit();
    return { successCount: toUpdate.length, failCount: 0 };
  } catch (e) {
    console.error("[booking-cascade] batch commit failed", { siteId, bookingIds: bookingIds.slice(0, 5), reason, error: e });
    return { successCount: 0, failCount: toUpdate.length };
  }
}
