/**
 * One-time cleanup: dedupe legacy archived bookings (in sites/.../bookings) by serviceTypeId.
 * Keeps only the newest per (client, serviceTypeId), deletes the rest, writes kept to new path.
 * Admin-only. Safe and batched (≤450 ops per batch).
 */

import admin from "firebase-admin";
import { getServiceTypeKey } from "./archiveReplace";

const BATCH_LIMIT = 400;

type AdminDb = ReturnType<typeof import("./firebaseAdmin").getAdminDb>;

function archivedAtMs(d: Record<string, unknown>): number {
  const at = d.archivedAt;
  if (at == null) return 0;
  if (typeof at === "object" && typeof (at as { toMillis?: () => number }).toMillis === "function")
    return (at as { toMillis: () => number }).toMillis();
  if (typeof at === "object" && typeof (at as { toDate?: () => Date }).toDate === "function")
    return (at as { toDate: () => Date }).toDate().getTime();
  if (typeof at === "string") return new Date(at).getTime();
  return 0;
}

function dateMs(d: Record<string, unknown>): number {
  const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
  const timeStr = (d.time as string) ?? (d.timeHHmm as string) ?? "00:00";
  if (!dateStr) return 0;
  return new Date(`${dateStr}T${timeStr}`).getTime();
}

/**
 * Alias for dedupeClientArchivedBookings (admin-only cleanup tool).
 * Loads legacy archive docs for client, groups by serviceTypeId, keeps newest, deletes rest, upserts to archivedServiceTypes.
 */
export const dedupeLegacyArchivedBookingsForClient = dedupeClientArchivedBookings;

/**
 * Dedupe archived bookings for one client. Loads from legacy path (bookings where isArchived),
 * groups by serviceTypeId (ignores worker/date), keeps newest per group, deletes rest, writes to new path.
 * Batched (<=400 deletes per batch).
 */
export async function dedupeClientArchivedBookings(
  adminDb: AdminDb,
  tenantId: string,
  clientId: string
): Promise<{ deletedCount: number; writtenCount: number }> {
  const siteId = tenantId;
  const bookingsCol = adminDb.collection("sites").doc(siteId).collection("bookings");
  const clientsRef = adminDb.collection("sites").doc(siteId).collection("clients");

  const byClientId = await bookingsCol.where("isArchived", "==", true).where("clientId", "==", clientId).get();
  const byPhone = await bookingsCol.where("isArchived", "==", true).where("customerPhone", "==", clientId).get();
  const seen = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const doc of byClientId.docs) {
    seen.set(doc.id, { id: doc.id, data: doc.data() as Record<string, unknown> });
  }
  for (const doc of byPhone.docs) {
    if (!seen.has(doc.id)) seen.set(doc.id, { id: doc.id, data: doc.data() as Record<string, unknown> });
  }

  const byServiceKey = new Map<string, { id: string; data: Record<string, unknown> }[]>();
  for (const { id, data } of seen.values()) {
    const key = getServiceTypeKey(data);
    const list = byServiceKey.get(key) ?? [];
    list.push({ id, data });
    byServiceKey.set(key, list);
  }

  const toDelete: string[] = [];
  const toWrite: { serviceTypeId: string; minimal: Record<string, unknown> }[] = [];
  for (const [serviceKey, list] of byServiceKey) {
    if (list.length === 0) continue;
    const newest = list.reduce((a, b) => {
      const aTime = archivedAtMs(a.data) || dateMs(a.data);
      const bTime = archivedAtMs(b.data) || dateMs(b.data);
      return bTime >= aTime ? b : a;
    });
    for (const { id } of list) {
      if (id !== newest.id) toDelete.push(id);
    }
    const d = newest.data;
    const statusAtArchive = (d.statusAtArchive ?? d.status) != null ? String(d.statusAtArchive ?? d.status).trim() : "booked";
    toWrite.push({
      serviceTypeId: serviceKey,
      minimal: {
        date: (d.date as string) ?? (d.dateISO as string) ?? "",
        serviceName: (d.serviceName as string) ?? "",
        serviceType: (d.serviceType as string) ?? null,
        serviceTypeId: (d.serviceTypeId as string) ?? serviceKey,
        workerId: (d.workerId as string) ?? null,
        workerName: (d.workerName as string) ?? null,
        customerPhone: (d.customerPhone as string) ?? (d.phone as string) ?? "",
        customerName: (d.customerName as string) ?? (d.name as string) ?? "",
        clientId: (d.clientId as string) ?? clientId,
        isArchived: true,
        archivedAt: d.archivedAt ?? admin.firestore.FieldValue.serverTimestamp(),
        archivedReason: (d.archivedReason as string) ?? "dedupe_migration",
        statusAtArchive,
      },
    });
  }

  let deletedCount = 0;
  let writtenCount = 0;
  for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    const chunk = toDelete.slice(i, i + BATCH_LIMIT);
    for (const id of chunk) {
      batch.delete(bookingsCol.doc(id));
      deletedCount++;
    }
    await batch.commit();
  }
  const archiveRef = clientsRef.doc(clientId).collection("archivedServiceTypes");
  for (const { serviceTypeId, minimal } of toWrite) {
    await archiveRef.doc(serviceTypeId).set(minimal, { merge: false });
    writtenCount++;
  }

  console.log("[dedupeClientArchivedBookings]", {
    tenantId,
    clientId,
    deletedCount,
    writtenCount,
  });
  return { deletedCount, writtenCount };
}

/**
 * Dedupe archived bookings for all clients in a tenant. Paginates over legacy archived docs, collects client ids, then runs dedupeClientArchivedBookings per client (batched).
 */
export async function dedupeAllClientsArchivedBookings(
  adminDb: AdminDb,
  tenantId: string,
  options?: { pageSize?: number }
): Promise<{ clientsProcessed: number; totalDeleted: number; totalWritten: number }> {
  const pageSize = options?.pageSize ?? 500;
  const siteId = tenantId;
  const bookingsCol = adminDb.collection("sites").doc(siteId).collection("bookings");
  const clientIds = new Set<string>();

  const snapshot = await bookingsCol.where("isArchived", "==", true).limit(5000).get();
  for (const doc of snapshot.docs) {
    const d = doc.data() as Record<string, unknown>;
    const cid = (d.clientId as string) ?? (d.customerPhone as string) ?? (d.phone as string);
    if (cid && String(cid).trim()) clientIds.add(String(cid).trim());
  }

  let totalDeleted = 0;
  let totalWritten = 0;
  for (const clientId of clientIds) {
    const { deletedCount, writtenCount } = await dedupeClientArchivedBookings(adminDb, tenantId, clientId);
    totalDeleted += deletedCount;
    totalWritten += writtenCount;
  }

  console.log("[dedupeAllClientsArchivedBookings]", {
    tenantId,
    clientsProcessed: clientIds.size,
    totalDeleted,
    totalWritten,
  });
  return { clientsProcessed: clientIds.size, totalDeleted, totalWritten };
}
