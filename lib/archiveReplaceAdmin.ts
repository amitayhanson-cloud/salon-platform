/**
 * Server-only: archive replace and unique-by-service-type helpers.
 * Uses same deterministic doc id as client: ${clientId}__${serviceTypeId}.
 */

import { getAdminDb } from "./firebaseAdmin";
import {
  getServiceTypeKey,
  getDeterministicArchiveDocId,
} from "./archiveReplace";

export { getDeterministicArchiveDocId };

/**
 * Returns ALL archived booking document IDs for same (client, serviceType).
 * Queries by clientId and optionally customerPhone (legacy docs).
 */
export async function getAllArchivedIdsForClientAndServiceTypeAdmin(
  adminDb: ReturnType<typeof getAdminDb>,
  siteId: string,
  clientId: string | null | undefined,
  customerPhone: string | null | undefined,
  serviceTypeId: string | null | undefined
): Promise<string[]> {
  const clientIdTrimmed =
    clientId != null && String(clientId).trim() !== "" ? String(clientId).trim() : null;
  const phoneTrimmed =
    customerPhone != null && String(customerPhone).trim() !== "" ? String(customerPhone).trim() : null;
  const serviceTypeKey =
    serviceTypeId != null && String(serviceTypeId).trim() !== ""
      ? String(serviceTypeId).trim()
      : null;
  if (!serviceTypeKey) return [];

  const col = adminDb.collection("sites").doc(siteId).collection("bookings");
  const seen = new Set<string>();

  if (clientIdTrimmed) {
    const snap = await col.where("isArchived", "==", true).where("clientId", "==", clientIdTrimmed).get();
    for (const doc of snap.docs) {
      if (getServiceTypeKey(doc.data() as Record<string, unknown>) === serviceTypeKey) seen.add(doc.id);
    }
  }
  if (phoneTrimmed) {
    const snap = await col.where("isArchived", "==", true).where("customerPhone", "==", phoneTrimmed).get();
    for (const doc of snap.docs) {
      if (getServiceTypeKey(doc.data() as Record<string, unknown>) === serviceTypeKey) seen.add(doc.id);
    }
  }
  return Array.from(seen);
}

/**
 * Returns archived booking IDs to replace (same client+serviceType), excluding given IDs.
 */
export async function getArchivedBookingIdsToReplaceAdmin(
  adminDb: ReturnType<typeof getAdminDb>,
  siteId: string,
  clientId: string | null | undefined,
  serviceTypeId: string | null | undefined,
  excludeBookingIds: string[]
): Promise<string[]> {
  const all = await getAllArchivedIdsForClientAndServiceTypeAdmin(
    adminDb,
    siteId,
    clientId,
    undefined,
    serviceTypeId
  );
  const excludeSet = new Set(excludeBookingIds);
  const filtered = all.filter((id) => !excludeSet.has(id));
  if (process.env.NODE_ENV !== "production" && filtered.length > 0) {
    console.log("[archiveReplace] admin replace", {
      siteId,
      clientId,
      serviceTypeKey: serviceTypeId,
      toDeleteCount: filtered.length,
    });
  }
  return filtered;
}

/**
 * Admin SDK: archive one booking per (tenant, client, serviceTypeId). O(1) Firestore ops per call.
 * Deletes only the current booking doc; upserts to archivedServiceTypes. No legacy cleanup on this path.
 */
export async function archiveBookingByServiceTypeUniqueAdmin(
  adminDb: ReturnType<typeof getAdminDb>,
  tenantId: string,
  clientId: string,
  serviceTypeId: string | null | undefined,
  bookingId: string,
  archivePayload: Record<string, unknown>,
  options: { customerPhone: string }
): Promise<{ wroteDocPath: string; deletedLegacyCount: number }> {
  const siteId = tenantId;
  const clientKey =
    (clientId != null && String(clientId).trim() !== "") ? String(clientId).trim() : (options.customerPhone?.trim() || null);
  if (!clientKey) {
    throw new Error("archiveBookingByServiceTypeUniqueAdmin: tenantId and clientId (or customerPhone) required");
  }

  const serviceTypeKey =
    serviceTypeId != null && String(serviceTypeId).trim() !== "" ? String(serviceTypeId).trim() : null;
  const docId = serviceTypeKey ?? `unknown__${bookingId}`;
  if (!serviceTypeKey) {
    console.warn("[archiveBookingByServiceTypeUnique] serviceTypeId missing, storing under fallback key", {
      tenantId,
      clientId: clientKey,
      bookingId,
      fallbackDocId: docId,
    });
  }

  const bookingsCol = adminDb.collection("sites").doc(siteId).collection("bookings");
  const archiveCol = adminDb.collection("sites").doc(siteId).collection("clients").doc(clientKey).collection("archivedServiceTypes");
  const batch = adminDb.batch();
  batch.delete(bookingsCol.doc(bookingId));
  batch.set(archiveCol.doc(docId), archivePayload, { merge: false });
  await batch.commit();

  const wroteDocPath = `sites/${siteId}/clients/${clientKey}/archivedServiceTypes/${docId}`;
  console.log("[archiveBookingByServiceTypeUnique]", {
    tenantId,
    clientId: clientKey,
    serviceTypeId: serviceTypeKey ?? undefined,
    wroteDocPath,
  });
  return { wroteDocPath, deletedLegacyCount: 1 };
}

/** Alias for backward compatibility. */
export async function archiveBookingUniqueByServiceTypeAdmin(
  adminDb: ReturnType<typeof getAdminDb>,
  siteId: string,
  bookingId: string,
  params: {
    clientId: string | null | undefined;
    customerPhone: string;
    serviceTypeId: string | null | undefined;
    minimal: Record<string, unknown>;
  }
): Promise<{ docId: string; deletedCount: number }> {
  const clientKey =
    (params.clientId != null && String(params.clientId).trim() !== "" ? String(params.clientId).trim() : null) ??
    (params.customerPhone?.trim() || null);
  if (!clientKey) throw new Error("archiveBookingUniqueByServiceTypeAdmin: clientId or customerPhone required");
  const { wroteDocPath, deletedLegacyCount } = await archiveBookingByServiceTypeUniqueAdmin(
    adminDb,
    siteId,
    clientKey,
    params.serviceTypeId,
    bookingId,
    params.minimal,
    { customerPhone: params.customerPhone }
  );
  const docId = wroteDocPath.split("/").pop() ?? "";
  return { docId, deletedCount: deletedLegacyCount };
}
