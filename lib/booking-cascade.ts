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
import { getDeterministicArchiveDocId } from "@/lib/archiveReplaceAdmin";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

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

  const col = db.collection("sites").doc(siteId).collection("bookings");
  type DocData = {
    status?: string;
    clientId?: string;
    serviceTypeId?: string;
    serviceType?: string;
    date?: string;
    dateISO?: string;
    serviceName?: string;
    customerPhone?: string;
    phone?: string;
    customerName?: string;
    name?: string;
    workerId?: string;
    workerName?: string;
    parentBookingId?: string | null;
  };
  const toUpdate: {
    ref: admin.firestore.DocumentReference;
    clientId: string | null;
    customerPhone: string;
    serviceTypeId: string | null;
    minimal: Record<string, unknown>;
  }[] = [];
  const followUpIdsToDeleteOnly: string[] = [];
  for (const id of bookingIds) {
    const ref = col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    if ((snap.data() as { isArchived?: boolean })?.isArchived === true) continue;
    const d = snap.data() as DocData;
    if (isFollowUpBooking(d as Record<string, unknown>)) {
      followUpIdsToDeleteOnly.push(id);
      if (process.env.NODE_ENV === "development") {
        console.log("[booking-cascade] Skipping archive for follow-up booking", id);
      }
      continue;
    }
    const originalStatus = d?.status != null && String(d.status).trim() !== "" ? String(d.status).trim() : null;
    console.log("[archive] bookingId", id, "statusAtArchive", d?.status ?? originalStatus);
    if (originalStatus == null) {
      console.warn("[booking-cascade] Archiving booking without status", id);
    }
    const statusAtArchive = originalStatus ?? "booked";
    const clientId = d?.clientId != null && String(d.clientId).trim() !== "" ? String(d.clientId).trim() : null;
    const serviceTypeId =
      d?.serviceTypeId != null && String(d.serviceTypeId).trim() !== ""
        ? String(d.serviceTypeId).trim()
        : (d?.serviceType != null && String(d.serviceType).trim() !== "" ? String(d.serviceType).trim() : null);
    const customerPhone = (d?.customerPhone ?? d?.phone ?? "").trim() || "";
    const dateStr = (d?.date ?? d?.dateISO ?? "") as string;
    const minimal: Record<string, unknown> = {
      date: dateStr,
      serviceName: (d?.serviceName as string) ?? "",
      serviceType: (d?.serviceType as string) ?? null,
      serviceTypeId: (d?.serviceTypeId as string) ?? null,
      workerId: (d?.workerId as string) ?? null,
      workerName: (d?.workerName as string) ?? null,
      customerPhone,
      customerName: (d?.customerName ?? d?.name ?? "") as string,
      clientId,
      isArchived: true,
      archivedAt: payload.archivedAt,
      archivedReason: payload.archivedReason,
      ...(payload.cancelledAt != null && { cancelledAt: payload.cancelledAt }),
      ...(payload.cancellationReason != null && { cancellationReason: payload.cancellationReason }),
      ...(payload.cancelledBy != null && { cancelledBy: payload.cancelledBy }),
      statusAtArchive,
    };
    toUpdate.push({ ref, clientId, customerPhone, serviceTypeId, minimal });
  }

  if (toUpdate.length === 0 && followUpIdsToDeleteOnly.length === 0) {
    return { successCount: 0, failCount: 0 };
  }

  const archiveWrites: { clientKey: string; docId: string; minimal: Record<string, unknown> }[] = [];
  for (const { ref, clientId, customerPhone, serviceTypeId, minimal } of toUpdate) {
    const clientKey = (clientId != null && String(clientId).trim() !== "") ? String(clientId).trim() : (customerPhone || "unknown");
    const { docId } = getDeterministicArchiveDocId(clientId, customerPhone, serviceTypeId, ref.id);
    archiveWrites.push({ clientKey, docId, minimal });
  }
  const mainIdsToDelete = new Set(toUpdate.map((u) => u.ref.id));
  const allToDelete = new Set([...mainIdsToDelete, ...followUpIdsToDeleteOnly]);

  const batch = db.batch();
  for (const id of allToDelete) {
    batch.delete(col.doc(id));
  }
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  for (const { clientKey, docId, minimal } of archiveWrites) {
    const archiveRef = clientsRef.doc(clientKey).collection("archivedServiceTypes").doc(docId);
    batch.set(archiveRef, minimal, { merge: false });
  }
  try {
    await batch.commit();
    console.log("[archiveBookingByServiceTypeUnique] cascade", {
      tenantId: siteId,
      deletedLegacyCount: allToDelete.size,
      writtenCount: archiveWrites.length,
    });
    return { successCount: toUpdate.length, failCount: 0 };
  } catch (e) {
    console.error("[booking-cascade] batch commit failed", { siteId, bookingIds: bookingIds.slice(0, 5), reason, error: e });
    return { successCount: 0, failCount: toUpdate.length };
  }
}
