/**
 * Find the single "next upcoming booking awaiting confirmation" for a phone (multi-tenant safe).
 * Uses Firestore collection group query on "bookings".
 * Server-only: Firebase Admin.
 */

import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isFollowUpBooking } from "@/lib/normalizeBooking";
import { deriveBookingStatusForWrite } from "@/lib/bookingStatusForWrite";
import {
  getDeterministicArchiveDocId,
  archiveBookingUniqueByServiceTypeAdmin,
} from "@/lib/archiveReplaceAdmin";
import { normalizeE164 } from "./e164";
import { getRelatedBookingIds } from "./relatedBookings";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

export type BookingForConfirmation = {
  id: string;
  siteId: string;
  salonName: string;
  startAt: Date;
  customerPhoneE164: string;
};

/**
 * Find bookings awaiting confirmation for this phone.
 * - customerPhoneE164 == e164
 * - whatsappStatus == "awaiting_confirmation"
 * - startAt > now - 2 hours (tolerate small drift)
 * Order by startAt asc, limit 5.
 * Returns { bookings, count }. Use count 0/1/>1 for webhook flow.
 */
export async function findAwaitingConfirmationByPhone(
  customerPhoneE164: string
): Promise<{ bookings: BookingForConfirmation[]; count: number }> {
  const stripped = (customerPhoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return { bookings: [], count: 0 };

  const db = getAdminDb();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const cutoff = Timestamp.fromDate(twoHoursAgo);

  const snapshot = await db
    .collectionGroup("bookings")
    .where("customerPhoneE164", "==", e164)
    .where("whatsappStatus", "==", "awaiting_confirmation")
    .where("startAt", ">", cutoff)
    .orderBy("startAt", "asc")
    .limit(5)
    .get();

  const bookings: BookingForConfirmation[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const startAt =
      data.startAt instanceof Timestamp
        ? data.startAt.toDate()
        : new Date((data.startAt?.seconds ?? 0) * 1000);
    const siteId = doc.ref.parent?.parent?.id ?? "";
    let salonName = "הסלון";
    if (siteId) {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      const config = siteSnap.data()?.config;
      salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
    }
    bookings.push({
      id: doc.id,
      siteId,
      salonName,
      startAt,
      customerPhoneE164: data.customerPhoneE164 ?? e164,
    });
  }
  return { bookings, count: bookings.length };
}

/**
 * Find the single most relevant booking for this phone (for backward compatibility).
 * Returns null if none or multiple.
 */
export async function findNextAwaitingConfirmationByPhone(
  customerPhoneE164: string
): Promise<BookingForConfirmation | null> {
  const { bookings, count } = await findAwaitingConfirmationByPhone(customerPhoneE164);
  if (count !== 1) return null;
  return bookings[0];
}

/**
 * Find the single upcoming booking for this phone with the given whatsappStatus.
 * Used to detect "already confirmed" / "already cancelled" when user sends YES/NO again.
 */
export async function findNextBookingByPhoneWithStatus(
  customerPhoneE164: string,
  whatsappStatus: "confirmed" | "cancelled"
): Promise<BookingForConfirmation | null> {
  const stripped = (customerPhoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return null;

  const db = getAdminDb();
  const now = Timestamp.now();

  const snapshot = await db
    .collectionGroup("bookings")
    .where("customerPhoneE164", "==", e164)
    .where("whatsappStatus", "==", whatsappStatus)
    .where("startAt", ">", now)
    .orderBy("startAt", "asc")
    .limit(2)
    .get();

  const docs = snapshot.docs;
  if (docs.length !== 1) return null;

  const doc = docs[0];
  const data = doc.data();
  const startAt = data.startAt instanceof Timestamp ? data.startAt.toDate() : new Date(data.startAt?.seconds * 1000);
  const siteId = doc.ref.parent?.parent?.id ?? "";
  let salonName = "הסלון";
  if (siteId) {
    const siteSnap = await db.collection("sites").doc(siteId).get();
    const config = siteSnap.data()?.config;
    salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
  }
  return {
    id: doc.id,
    siteId,
    salonName,
    startAt,
    customerPhoneE164: data.customerPhoneE164 ?? e164,
  };
}

/**
 * Set booking to confirmed and set confirmationReceivedAt.
 * Propagates to all related bookings (same visitGroupId/parentBookingId chain) for status consistency.
 * This is the ONLY place that sets Firestore status to "confirmed" when user explicitly confirms (e.g. WhatsApp YES).
 */
export async function markBookingConfirmed(siteId: string, bookingId: string): Promise<void> {
  const db = getAdminDb();
  const { bookingIds, groupKey, rootId } = await getRelatedBookingIds(siteId, bookingId);

  if (process.env.NODE_ENV === "development") {
    console.log("[confirmStage] bookingId=" + bookingId + " setting status confirmed (user explicitly confirmed)");
  }

  const payload = {
    whatsappStatus: "confirmed" as const,
    status: deriveBookingStatusForWrite({ status: "confirmed" }, "confirm") as "confirmed",
    confirmationReceivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = db.batch();
  for (const id of bookingIds) {
    batch.update(db.collection("sites").doc(siteId).collection("bookings").doc(id), payload);
  }
  await batch.commit();

  console.log("[WA_CONFIRM] status_propagated", {
    bookingId,
    rootId,
    groupKey: groupKey ?? undefined,
    relatedCount: bookingIds.length,
    status: "confirmed",
  });
}

/**
 * Parse bookingRef "sites/{siteId}/bookings/{bookingId}" and fetch the booking if it exists
 * and whatsappStatus === "awaiting_confirmation". Returns null otherwise.
 */
export async function getBookingByRefIfAwaitingConfirmation(bookingRef: string): Promise<{
  siteId: string;
  bookingId: string;
  salonName: string;
  startAt: Date;
} | null> {
  const match = /^sites\/([^/]+)\/bookings\/([^/]+)$/.exec(bookingRef);
  if (!match) return null;
  const [, siteId, bookingId] = match;
  const db = getAdminDb();
  const doc = await db.collection("sites").doc(siteId).collection("bookings").doc(bookingId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.whatsappStatus !== "awaiting_confirmation") return null;
  const startAt =
    data.startAt instanceof Timestamp
      ? data.startAt.toDate()
      : new Date((data.startAt?.seconds ?? 0) * 1000);
  let salonName = "הסלון";
  const siteSnap = await db.collection("sites").doc(siteId).get();
  const config = siteSnap.data()?.config;
  salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
  return { siteId, bookingId, salonName, startAt };
}

/** Cancel/archive payload applied to all group members (NO reply). Same as root cancel; no hard delete. */
const CANCELLED_BY_WHATSAPP_PAYLOAD = {
  whatsappStatus: "cancelled" as const,
  status: "cancelled" as const,
  cancelledAt: serverTimestamp(),
  isArchived: true,
  archivedAt: serverTimestamp(),
  archivedReason: "customer_cancelled_via_whatsapp" as const,
  statusAtArchive: "cancelled" as const,
  updatedAt: serverTimestamp(),
};

/**
 * Apply cancellation (status + archive) to a single booking. Idempotent.
 * Uses deterministic archive: one doc per (client, serviceType).
 */
export async function applyCancelledByWhatsAppToBooking(
  siteId: string,
  memberId: string
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookings").doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() as Record<string, unknown>;
  if (isFollowUpBooking(d)) {
    await ref.delete();
    if (process.env.NODE_ENV === "development") {
      console.log("[applyCancelledByWhatsApp] Skipping archive for follow-up booking", memberId);
    }
    return;
  }
  const data = d as {
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
  };
  const clientId = data?.clientId != null && String(data.clientId).trim() !== "" ? String(data.clientId).trim() : null;
  const serviceTypeId =
    data?.serviceTypeId != null && String(data.serviceTypeId).trim() !== ""
      ? String(data.serviceTypeId).trim()
      : (data?.serviceType != null && String(data.serviceType).trim() !== "" ? String(data.serviceType).trim() : null);
  const customerPhone = (data?.customerPhone ?? data?.phone ?? "").trim() || "";
  const dateStr = (data?.date ?? data?.dateISO ?? "") as string;
  const minimal: Record<string, unknown> = {
    date: dateStr,
    serviceName: (data?.serviceName as string) ?? "",
    serviceType: (data?.serviceType as string) ?? null,
    serviceTypeId: (data?.serviceTypeId as string) ?? null,
    workerId: (data?.workerId as string) ?? null,
    workerName: (data?.workerName as string) ?? null,
    customerPhone,
    customerName: (data?.customerName ?? data?.name ?? "") as string,
    clientId,
    ...CANCELLED_BY_WHATSAPP_PAYLOAD,
  };
  await archiveBookingUniqueByServiceTypeAdmin(db, siteId, memberId, {
    clientId,
    customerPhone,
    serviceTypeId,
    minimal,
  });
}

/**
 * Cancel/archive the ENTIRE booking group (root + follow-ups) in a single batch.
 * Resolves group FIRST (no writes), then one batch.commit() so root is not updated before follow-ups.
 * Uses the SAME group resolver as YES (getRelatedBookingIds). Safe/atomic.
 */
export async function cancelBookingGroupByWhatsApp(siteId: string, bookingId: string): Promise<void> {
  const db = getAdminDb();
  const { bookingIds, rootId, groupKey } = await getRelatedBookingIds(siteId, bookingId);
  const rootBookingRef = `sites/${siteId}/bookings/${rootId}`;
  const bookingRefsInGroup = bookingIds.map((id) => `sites/${siteId}/bookings/${id}`);

  console.log("[WA_WEBHOOK] group_resolved", {
    action: "no",
    rootBookingRef,
    membersCount: bookingIds.length,
    memberIds: bookingIds,
    bookingRefsInGroup,
  });

  const col = db.collection("sites").doc(siteId).collection("bookings");
  type DocData = {
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
  const archiveWrites: { clientKey: string; docId: string; minimal: Record<string, unknown> }[] = [];
  for (const id of bookingIds) {
    const ref = col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const d = snap.data() as DocData;
    if (isFollowUpBooking(d as Record<string, unknown>)) {
      if (process.env.NODE_ENV === "development") {
        console.log("[cancelBookingGroupByWhatsApp] Skipping archive for follow-up booking", id);
      }
      continue;
    }
    const clientId = d?.clientId != null && String(d.clientId).trim() !== "" ? String(d.clientId).trim() : null;
    const serviceTypeId =
      d?.serviceTypeId != null && String(d.serviceTypeId).trim() !== ""
        ? String(d.serviceTypeId).trim()
        : (d?.serviceType != null && String(d.serviceType).trim() !== "" ? String(d.serviceType).trim() : null);
    const customerPhone = (d?.customerPhone ?? d?.phone ?? "").trim() || "";
    const clientKey = clientId ?? customerPhone ?? "unknown";
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
      ...CANCELLED_BY_WHATSAPP_PAYLOAD,
    };
    const { docId } = getDeterministicArchiveDocId(clientId, customerPhone, serviceTypeId, id);
    archiveWrites.push({ clientKey, docId, minimal });
  }
  const batch = db.batch();
  for (const id of bookingIds) {
    batch.delete(col.doc(id));
  }
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  for (const { clientKey, docId, minimal } of archiveWrites) {
    const archiveRef = clientsRef.doc(clientKey).collection("archivedServiceTypes").doc(docId);
    batch.set(archiveRef, minimal, { merge: false });
  }
  await batch.commit();

  console.log("[WA_WEBHOOK] cancelled_group_done", {
    action: "no",
    membersCount: bookingIds.length,
    cancelledCount: bookingIds.length,
    bookingIdsUpdated: bookingIds,
    groupKey: groupKey ?? undefined,
  });
}

/**
 * Set booking to cancelled (WhatsApp flow) when user replies NO.
 * Delegates to cancelBookingGroupByWhatsApp (batch) for group-wide cancel.
 */
export async function markBookingCancelledByWhatsApp(siteId: string, bookingId: string): Promise<void> {
  await cancelBookingGroupByWhatsApp(siteId, bookingId);
}
