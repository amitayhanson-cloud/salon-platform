/**
 * Cascade cancel/archive: when ANY booking in a multi-part set is cancelled,
 * ALL bookings "booked together" must be cancelled/archived the same way.
 * Uses existing grouping (visitGroupId/parentBookingId) or safe heuristic (same customer + createdAt window).
 * Does NOT change booking creation, scheduling, or calendar logic.
 */

import admin from "firebase-admin";
import type {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  UpdateData,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";
import { MAX_RELATED_BOOKINGS } from "@/lib/whatsapp/relatedBookings";
import { getDeterministicArchiveDocId } from "@/lib/archiveReplaceAdmin";
import { getServiceTypeKey } from "@/lib/archiveReplace";
import { isFollowUpBooking } from "@/lib/normalizeBooking";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";
import { prepareDashboardBatchIncrement, type LiveStatsBookingEffect } from "@/lib/liveStatsScorekeeper";
import {
  liveStatsDeltaForActiveCancellation,
  liveStatsDeltaUndoCreatedOnly,
  liveStatsDeltaUndoFollowUpOnly,
} from "@/lib/liveStatsBookingDeltas";
import { bookingDocToFreedSlot } from "@/lib/bookingWaitlist/bookingDocToFreedSlot";
import { notifyBookingWaitlistFromFreedSlot } from "@/lib/bookingWaitlist/notifySlotFreed";

const ISRAEL_TZ = "Asia/Jerusalem";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

/** Hard cap for cascade (heuristic path). */
export const CASCADE_CAP = 10;

export type CascadeCancelReason =
  | "manual"
  | "auto"
  | "customer_cancelled_via_whatsapp"
  | "customer_cancelled_via_public_booking"
  | "admin_delete";

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
  const isPublicBooking = reason === "customer_cancelled_via_public_booking";
  const isAdminDelete = reason === "admin_delete";
  const base: Record<string, unknown> = isAdminDelete
    ? {
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedReason: "admin_delete" as const,
        updatedAt: serverTimestamp(),
      }
    : isWhatsApp || isPublicBooking
    ? {
        whatsappStatus: "cancelled" as const,
        status: "cancelled" as const,
        cancelledAt: serverTimestamp(),
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedReason: isWhatsApp
          ? "customer_cancelled_via_whatsapp"
          : "customer_cancelled_via_public_booking",
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
  if (reason === "manual" && adminOptions && !isAdminDelete) {
    if (adminOptions.cancellationReason != null && adminOptions.cancellationReason !== "") {
      payload.cancellationReason = adminOptions.cancellationReason;
    }
    if (adminOptions.cancelledBy != null && adminOptions.cancelledBy !== "") {
      payload.cancelledBy = adminOptions.cancelledBy;
    }
    payload.cancelledAt = serverTimestamp();
    payload.archivedReason = "admin_cancel";
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
    fullData: Record<string, unknown>;
  }[] = [];
  const followUpsToDelete: { id: string; data: Record<string, unknown> }[] = [];
  for (const id of bookingIds) {
    const ref = col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    if ((snap.data() as { isArchived?: boolean })?.isArchived === true) continue;
    const d = snap.data() as DocData;
    const full = snap.data() as Record<string, unknown>;
    if (isFollowUpBooking(d as Record<string, unknown>)) {
      followUpsToDelete.push({ id, data: full });
      if (process.env.NODE_ENV === "development") {
        console.log("[booking-cascade] Skipping archive for follow-up booking", id);
      }
      continue;
    }
    const originalStatus = d?.status != null && String(d.status).trim() !== "" ? String(d.status).trim() : null;
    // For manual (admin cancel) and customer_cancelled_via_whatsapp: MUST use "cancelled"
    // so archived docs appear on Cancelled Bookings page. For "auto" (expiry): keep original status.
    const statusAtArchive =
      reason === "admin_delete" || reason === "auto"
        ? (originalStatus ?? "booked")
        : reason === "manual" ||
            reason === "customer_cancelled_via_whatsapp" ||
            reason === "customer_cancelled_via_public_booking"
          ? "cancelled"
          : (originalStatus ?? "booked");
    if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log("[archive] bookingId", id, "reason", reason, "statusAtArchive", statusAtArchive);
    }
    const clientId = d?.clientId != null && String(d.clientId).trim() !== "" ? String(d.clientId).trim() : null;
    const serviceTypeId =
      d?.serviceTypeId != null && String(d.serviceTypeId).trim() !== ""
        ? String(d.serviceTypeId).trim()
        : (d?.serviceType != null && String(d.serviceType).trim() !== "" ? String(d.serviceType).trim() : null);
    const customerPhone = (d?.customerPhone ?? d?.phone ?? "").trim() || "";
    const dateStr = (d?.date ?? d?.dateISO ?? "") as string;
    const cancellationMonthKey = getDateYMDInTimezone(new Date(), ISRAEL_TZ).slice(0, 7);
    const minimal: Record<string, unknown> = {
      archiveSiteId: siteId,
      cancellationMonthKey,
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
      ...(statusAtArchive === "cancelled" && { status: "cancelled" as const }),
    };
    toUpdate.push({ ref, clientId, customerPhone, serviceTypeId, minimal, fullData: full });
  }

  if (toUpdate.length === 0 && followUpsToDelete.length === 0) {
    return { successCount: 0, failCount: 0 };
  }

  const archiveWrites: {
    clientKey: string;
    docId: string;
    minimal: Record<string, unknown>;
    serviceTypeKey: string | null;
  }[] = [];
  for (const { ref, clientId, customerPhone, serviceTypeId, minimal } of toUpdate) {
    const clientKey = (clientId != null && String(clientId).trim() !== "") ? String(clientId).trim() : (customerPhone || "unknown");
    const { docId } = getDeterministicArchiveDocId(clientId, customerPhone, serviceTypeId, ref.id);
    const serviceTypeKey =
      serviceTypeId != null && String(serviceTypeId).trim() !== "" ? String(serviceTypeId).trim() : null;
    archiveWrites.push({ clientKey, docId, minimal, serviceTypeKey });
  }
  const mainIdsToDelete = new Set(toUpdate.map((u) => u.ref.id));
  const allToDelete = new Set([...mainIdsToDelete, ...followUpsToDelete.map((f) => f.id)]);

  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  const archiveByClient = new Map<string, QueryDocumentSnapshot[]>();
  for (const ck of new Set(archiveWrites.map((w) => w.clientKey))) {
    const snap = await clientsRef.doc(ck).collection("archivedServiceTypes").get();
    archiveByClient.set(ck, snap.docs);
  }
  const stalePath = new Set<string>();
  const staleRefs: DocumentReference[] = [];
  for (const w of archiveWrites) {
    if (!w.serviceTypeKey) continue;
    for (const ad of archiveByClient.get(w.clientKey) ?? []) {
      if (ad.id === w.docId) continue;
      if (getServiceTypeKey(ad.data() as Record<string, unknown>) === w.serviceTypeKey) {
        const p = ad.ref.path;
        if (!stalePath.has(p)) {
          stalePath.add(p);
          staleRefs.push(ad.ref);
        }
      }
    }
  }

  // Always mirror live-stats when removing booking docs (including reason "auto"): archive-delete
  // does not trigger the Cloud Function update path, and "auto" cleanups still remove counted rows.
  const liveEffects: LiveStatsBookingEffect[] = [];
  for (const row of toUpdate) {
    const pack = liveStatsDeltaForActiveCancellation(row.fullData);
    if (pack) liveEffects.push(pack);
  }
  for (const { data } of followUpsToDelete) {
    const pack = liveStatsDeltaUndoFollowUpOnly(data);
    if (pack) liveEffects.push(pack);
  }
  const dashPatch =
    liveEffects.length > 0 ? await prepareDashboardBatchIncrement(db, siteId, liveEffects) : null;
  const dashRef = db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");

  const batch = db.batch();
  for (const ref of staleRefs) {
    batch.delete(ref);
  }
  for (const id of allToDelete) {
    batch.delete(col.doc(id));
  }
  for (const { clientKey, docId, minimal } of archiveWrites) {
    const archiveRef = clientsRef.doc(clientKey).collection("archivedServiceTypes").doc(docId);
    batch.set(archiveRef, minimal, { merge: false });
  }
  if (dashPatch && Object.keys(dashPatch).length > 0) {
    // Must use update(), not set(merge): dotted keys like days.{ymd}.bookings are real nested
    // paths only with update — set+merge would miss live stats (bookings/revenue/cancellations).
    batch.update(dashRef, dashPatch as UpdateData<DocumentData>);
  }
  try {
    await batch.commit();
    console.log("[archiveBookingByServiceTypeUnique] cascade", {
      tenantId: siteId,
      deletedLegacyCount: allToDelete.size,
      writtenCount: archiveWrites.length,
    });
    for (const row of toUpdate) {
      const slot = bookingDocToFreedSlot(row.fullData as Record<string, unknown>);
      if (!slot) continue;
      try {
        await notifyBookingWaitlistFromFreedSlot(siteId, slot);
      } catch (waitlistErr) {
        console.error("[booking-cascade] waitlist notify failed", waitlistErr);
      }
    }
    return { successCount: toUpdate.length, failCount: 0 };
  } catch (e) {
    console.error("[booking-cascade] batch commit failed", { siteId, bookingIds: bookingIds.slice(0, 5), reason, error: e });
    return { successCount: 0, failCount: toUpdate.length };
  }
}

const FIRESTORE_BATCH_DELETE_LIMIT = 500;

/**
 * Hard-delete booking documents only (no client archivedServiceTypes writes).
 * Use for mistaken test bookings. Same doc set as getRelatedBookingIds (group + follow-ups).
 */
export async function permanentDeleteBookingGroupDocs(
  siteId: string,
  bookingIds: string[]
): Promise<{ successCount: number; failCount: number }> {
  if (bookingIds.length === 0) {
    return { successCount: 0, failCount: 0 };
  }
  const db = getAdminDb();
  const col = db.collection("sites").doc(siteId).collection("bookings");
  let successCount = 0;
  let failCount = 0;
  const dashRef = db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");
  for (let i = 0; i < bookingIds.length; i += FIRESTORE_BATCH_DELETE_LIMIT) {
    const chunk = bookingIds.slice(i, i + FIRESTORE_BATCH_DELETE_LIMIT);
    const liveEffects: LiveStatsBookingEffect[] = [];
    for (const id of chunk) {
      const snap = await col.doc(id).get();
      if (!snap.exists) continue;
      const d = snap.data() as Record<string, unknown>;
      const fu = liveStatsDeltaUndoFollowUpOnly(d);
      if (fu) {
        liveEffects.push(fu);
        continue;
      }
      const undo = liveStatsDeltaUndoCreatedOnly(d);
      if (undo) liveEffects.push(undo);
    }
    const dashPatch =
      liveEffects.length > 0 ? await prepareDashboardBatchIncrement(db, siteId, liveEffects) : null;
    const batch = db.batch();
    if (dashPatch && Object.keys(dashPatch).length > 0) {
      batch.update(dashRef, dashPatch as UpdateData<DocumentData>);
    }
    for (const id of chunk) {
      batch.delete(col.doc(id));
    }
    try {
      await batch.commit();
      successCount += chunk.length;
    } catch (e) {
      console.error("[permanentDeleteBookingGroupDocs] batch failed", { siteId, error: e });
      failCount += chunk.length;
    }
  }
  return { successCount, failCount };
}
