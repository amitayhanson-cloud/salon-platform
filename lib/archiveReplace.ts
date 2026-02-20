/**
 * Archive replace: keep only the newest archived booking per (tenant, client, serviceType).
 * When archiving a booking, delete any existing archived doc for the same key so storage stays bounded.
 * Used only on archive write paths; does NOT touch booking creation or calendar logic.
 */

import { query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebaseClient";
import {
  bookingsCollection,
  bookingDoc,
  clientArchivedServiceTypeDoc,
} from "./firestorePaths";

/** Normalize service type key from doc (serviceTypeId preferred, else serviceType, else unknown). */
export function getServiceTypeKey(d: Record<string, unknown>): string {
  const v = (d.serviceTypeId as string) ?? (d.serviceType as string);
  return v != null && String(v).trim() !== "" ? String(v).trim() : "unknown";
}

/**
 * Deterministic archive doc id and whether we may delete other docs.
 * - When serviceTypeId is set: docId = `${clientKey}__${serviceTypeId}`, shouldDeleteOthers = true.
 * - When serviceTypeId is missing: docId = `${clientKey}__unknown__${bookingId}`, shouldDeleteOthers = false.
 * clientKey = clientId ?? customerPhone ?? "unknown".
 */
export function getDeterministicArchiveDocId(
  clientId: string | null | undefined,
  customerPhone: string | null | undefined,
  serviceTypeId: string | null | undefined,
  bookingId: string
): { docId: string; shouldDeleteOthers: boolean } {
  const clientKey =
    (clientId != null && String(clientId).trim() !== "" ? String(clientId).trim() : null) ??
    (customerPhone != null && String(customerPhone).trim() !== "" ? String(customerPhone).trim() : null) ??
    "unknown";
  const serviceTypeKey =
    serviceTypeId != null && String(serviceTypeId).trim() !== ""
      ? String(serviceTypeId).trim()
      : null;
  if (serviceTypeKey) {
    return { docId: `${clientKey}__${serviceTypeKey}`, shouldDeleteOthers: true };
  }
  return { docId: `${clientKey}__unknown__${bookingId}`, shouldDeleteOthers: false };
}

/**
 * Returns ALL archived booking document IDs for same (client, serviceType).
 * Queries by clientId and optionally customerPhone (to catch legacy docs without clientId).
 */
export async function getAllArchivedIdsForClientAndServiceTypeClient(
  siteId: string,
  clientId: string | null | undefined,
  customerPhone: string | null | undefined,
  serviceTypeId: string | null | undefined
): Promise<string[]> {
  if (!db) return [];
  const clientIdTrimmed =
    clientId != null && String(clientId).trim() !== "" ? String(clientId).trim() : null;
  const phoneTrimmed =
    customerPhone != null && String(customerPhone).trim() !== "" ? String(customerPhone).trim() : null;
  const serviceTypeKey =
    serviceTypeId != null && String(serviceTypeId).trim() !== ""
      ? String(serviceTypeId).trim()
      : null;
  if (!serviceTypeKey) return [];

  const seen = new Set<string>();
  const collect = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => {
    for (const d of snap.docs) {
      if (getServiceTypeKey(d.data()) === serviceTypeKey) seen.add(d.id);
    }
  };

  if (clientIdTrimmed) {
    const q = query(
      bookingsCollection(siteId),
      where("isArchived", "==", true),
      where("clientId", "==", clientIdTrimmed)
    );
    const snap = await getDocs(q);
    collect(snap as { docs: { id: string; data: () => Record<string, unknown> }[] });
  }
  if (phoneTrimmed) {
    const q = query(
      bookingsCollection(siteId),
      where("isArchived", "==", true),
      where("customerPhone", "==", phoneTrimmed)
    );
    const snap = await getDocs(q);
    collect(snap as { docs: { id: string; data: () => Record<string, unknown> }[] });
  }
  return Array.from(seen);
}

/**
 * Client SDK: returns archived booking IDs to replace (same client+serviceType), excluding one id.
 */
export async function getArchivedBookingIdsToReplaceClient(
  siteId: string,
  clientId: string | null | undefined,
  serviceTypeId: string | null | undefined,
  excludeBookingId: string
): Promise<string[]> {
  const all = await getAllArchivedIdsForClientAndServiceTypeClient(
    siteId,
    clientId,
    undefined,
    serviceTypeId
  );
  const filtered = all.filter((id) => id !== excludeBookingId);
  if (process.env.NODE_ENV !== "production" && filtered.length > 0) {
    console.log("[archiveReplace] client replace", {
      siteId,
      clientId,
      serviceTypeKey: serviceTypeId,
      excludeBookingId,
      toDeleteCount: filtered.length,
    });
  }
  return filtered;
}

/**
 * Archive one booking per (tenant, client, serviceTypeId). O(1) Firestore ops per call.
 * - Deletes only the current booking doc from bookings.
 * - Upserts to sites/{siteId}/clients/{clientId}/archivedServiceTypes/{serviceTypeId}.
 * Legacy duplicate cleanup is done by a separate admin script (dedupeClientArchivedBookings), not on UI click.
 */
export async function archiveBookingByServiceTypeUnique(
  tenantId: string,
  clientId: string,
  serviceTypeId: string | null | undefined,
  bookingId: string,
  archivePayload: Record<string, unknown>,
  options: { customerPhone: string }
): Promise<{ wroteDocPath: string; deletedLegacyCount: number }> {
  if (!db) throw new Error("Firestore db not initialized");
  const siteId = tenantId;
  const clientKey =
    (clientId != null && String(clientId).trim() !== "") ? String(clientId).trim() : (options.customerPhone?.trim() || null);
  if (!clientKey) {
    throw new Error("archiveBookingByServiceTypeUnique: tenantId and clientId (or customerPhone) required");
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

  const batch = writeBatch(db);
  batch.delete(bookingDoc(siteId, bookingId));
  const archiveRef = clientArchivedServiceTypeDoc(siteId, clientKey, docId);
  batch.set(archiveRef, archivePayload, { merge: false });
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
export async function archiveBookingUniqueByServiceTypeClient(
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
  if (!clientKey) throw new Error("archiveBookingUniqueByServiceTypeClient: clientId or customerPhone required");
  const { wroteDocPath, deletedLegacyCount } = await archiveBookingByServiceTypeUnique(
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
