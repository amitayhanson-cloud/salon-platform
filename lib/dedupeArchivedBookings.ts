/**
 * One-time cleanup: dedupe legacy archived bookings (in sites/.../bookings) by serviceTypeId.
 * Keeps only the newest per (client, serviceTypeId), deletes the rest, writes kept to new path.
 * Admin-only. Safe and batched (≤450 ops per batch).
 */

import type { DocumentReference } from "firebase-admin/firestore";
import admin from "firebase-admin";
import { getDeterministicArchiveDocId, getServiceTypeKey } from "./archiveReplace";
import { isFollowUpBooking } from "./normalizeBooking";

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
    const data = doc.data() as Record<string, unknown>;
    if (isFollowUpBooking(data)) continue;
    seen.set(doc.id, { id: doc.id, data });
  }
  for (const doc of byPhone.docs) {
    if (seen.has(doc.id)) continue;
    const data = doc.data() as Record<string, unknown>;
    if (isFollowUpBooking(data)) continue;
    seen.set(doc.id, { id: doc.id, data });
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

type FirestoreDocSnap = FirebaseFirestore.QueryDocumentSnapshot;

/**
 * Deduplicate `sites/{siteId}/clients/{clientKey}/archivedServiceTypes` only.
 * Booking history loads this subcollection directly; duplicates here (legacy id vs `{clientKey}__{serviceTypeId}`)
 * show as multiple rows. Groups by {@link getServiceTypeKey}; keeps newest; collapses to canonical doc id.
 */
export async function dedupeArchivedServiceTypesSubcollectionForClient(
  adminDb: AdminDb,
  siteId: string,
  clientKey: string
): Promise<{ deletedCount: number; wroteCanonical: number }> {
  const col = adminDb
    .collection("sites")
    .doc(siteId)
    .collection("clients")
    .doc(clientKey)
    .collection("archivedServiceTypes");
  const snap = await col.get();
  if (snap.empty) return { deletedCount: 0, wroteCanonical: 0 };

  const byGroup = new Map<string, FirestoreDocSnap[]>();
  for (const doc of snap.docs) {
    const sk = getServiceTypeKey(doc.data() as Record<string, unknown>);
    const groupKey = sk === "unknown" ? `__u__${doc.id}` : sk;
    const list = byGroup.get(groupKey) ?? [];
    list.push(doc);
    byGroup.set(groupKey, list);
  }

  const deletes: DocumentReference[] = [];
  const sets: { ref: DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];

  for (const [, docs] of byGroup) {
    if (docs.length === 0) continue;
    const sorted = [...docs].sort((a, b) => {
      const da = a.data() as Record<string, unknown>;
      const db = b.data() as Record<string, unknown>;
      const ta = archivedAtMs(da) || dateMs(da);
      const tb = archivedAtMs(db) || dateMs(db);
      return tb - ta;
    });
    const winner = sorted[0]!;
    const wdata = winner.data() as Record<string, unknown>;
    const phone = (wdata.customerPhone as string) ?? (wdata.phone as string) ?? "";
    const cid = (wdata.clientId as string) ?? clientKey;
    const stRaw = (wdata.serviceTypeId as string) ?? (wdata.serviceType as string) ?? null;
    const stId = stRaw != null && String(stRaw).trim() !== "" ? String(stRaw).trim() : null;
    const { docId: canonicalId } = getDeterministicArchiveDocId(cid, phone, stId, winner.id);

    if (sorted.length === 1 && winner.id === canonicalId) continue;

    if (winner.id === canonicalId) {
      for (const d of sorted) {
        if (d.id !== canonicalId) deletes.push(d.ref);
      }
      continue;
    }

    for (const d of sorted) {
      deletes.push(d.ref);
    }
    sets.push({ ref: col.doc(canonicalId), data: winner.data() });
  }

  let deletedCount = 0;
  for (let i = 0; i < deletes.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    for (const ref of deletes.slice(i, i + BATCH_LIMIT)) {
      batch.delete(ref);
      deletedCount++;
    }
    await batch.commit();
  }

  let wroteCanonical = 0;
  for (let i = 0; i < sets.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    for (const { ref, data } of sets.slice(i, i + BATCH_LIMIT)) {
      batch.set(ref, data, { merge: false });
      wroteCanonical++;
    }
    await batch.commit();
  }

  console.log("[dedupeArchivedServiceTypesSubcollectionForClient]", {
    siteId,
    clientKey,
    deletedCount,
    wroteCanonical,
  });
  return { deletedCount, wroteCanonical };
}

/**
 * Run {@link dedupeArchivedServiceTypesSubcollectionForClient} for every client doc under the site.
 */
export async function dedupeArchivedServiceTypesForSite(
  adminDb: AdminDb,
  siteId: string
): Promise<{
  clientsScanned: number;
  clientsTouched: number;
  totalDeleted: number;
  totalWrote: number;
}> {
  const clientsSnap = await adminDb.collection("sites").doc(siteId).collection("clients").get();
  let clientsTouched = 0;
  let totalDeleted = 0;
  let totalWrote = 0;

  for (const c of clientsSnap.docs) {
    const { deletedCount, wroteCanonical } = await dedupeArchivedServiceTypesSubcollectionForClient(
      adminDb,
      siteId,
      c.id
    );
    if (deletedCount > 0 || wroteCanonical > 0) clientsTouched++;
    totalDeleted += deletedCount;
    totalWrote += wroteCanonical;
  }

  console.log("[dedupeArchivedServiceTypesForSite]", {
    siteId,
    clientsScanned: clientsSnap.size,
    clientsTouched,
    totalDeleted,
    totalWrote,
  });

  return {
    clientsScanned: clientsSnap.size,
    clientsTouched,
    totalDeleted,
    totalWrote,
  };
}
