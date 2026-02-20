/**
 * Dev/admin only: reset bookings and archived history for a site (optionally one client).
 * Chunked deletes with limit(200), no unbounded reads, no listeners.
 * Use from API route (with auth) or CLI script (Admin SDK only).
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

const CHUNK_SIZE = 200;
const FieldPath = admin.firestore.FieldPath;

/** Canonical subcollection name used by the UI and archive logic (firestorePaths.ts). */
export const ARCHIVED_SERVICE_TYPES_COLLECTION = "archivedServiceTypes";

export interface DevResetBookingsResult {
  deletedBookings: number;
  deletedArchivedServiceTypes: number;
  iterationsBookings: number;
  iterationsArchived: number;
  dryRun: boolean;
  /** Per-path delete counts for archivedServiceTypes (e.g. sites/xyz/clients/054.../archivedServiceTypes). */
  deletedByPath?: Record<string, number>;
}

/**
 * Delete all bookings (and optionally only for one client) and all archivedServiceTypes
 * for the site/client. Uses chunked queries and WriteBatch. Safe for large datasets.
 */
export async function devResetBookings(
  db: Firestore,
  siteId: string,
  options: { clientId?: string; dryRun?: boolean } = {}
): Promise<DevResetBookingsResult> {
  const { clientId, dryRun = false } = options;
  const clientIdDigitsOnly = clientId ? clientId.replace(/\D/g, "") : null;
  const clientIdNormalizedPhone = clientId ? clientId.replace(/\s|-|\(|\)/g, "") : null;
  const clientIdStripLeadingZero = clientIdDigitsOnly ? clientIdDigitsOnly.replace(/^0+/, "") || clientIdDigitsOnly : null;
  const clientIdWithLeadingZero =
    clientIdDigitsOnly && clientIdDigitsOnly.length === 9 && clientIdDigitsOnly.startsWith("5")
      ? "0" + clientIdDigitsOnly
      : null;
  const result: DevResetBookingsResult = {
    deletedBookings: 0,
    deletedArchivedServiceTypes: 0,
    iterationsBookings: 0,
    iterationsArchived: 0,
    dryRun,
    deletedByPath: {},
  };

  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");

  // 1) Delete bookings in chunks (filter by client if provided)
  let query = clientId
    ? bookingsRef.where("customerPhone", "==", clientId).limit(CHUNK_SIZE)
    : bookingsRef.orderBy(FieldPath.documentId()).limit(CHUNK_SIZE);

  let snapshot = await query.get();
  while (!snapshot.empty) {
    result.iterationsBookings += 1;
    if (!dryRun) {
      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        result.deletedBookings += 1;
      }
      await batch.commit();
    } else {
      result.deletedBookings += snapshot.docs.length;
    }
    if (snapshot.docs.length < CHUNK_SIZE) break;
    const last = snapshot.docs[snapshot.docs.length - 1];
    query = clientId
      ? bookingsRef.where("customerPhone", "==", clientId).limit(CHUNK_SIZE).startAfter(last)
      : bookingsRef.orderBy(FieldPath.documentId()).limit(CHUNK_SIZE).startAfter(last);
    snapshot = await query.get();
  }

  // If clientId filter: also delete bookings that use clientId field (legacy), and customerPhone variants
  if (clientId) {
    for (const field of ["clientId", "customerPhone"] as const) {
      let q2 = bookingsRef.where(field, "==", clientId).limit(CHUNK_SIZE);
      let snap2 = await q2.get();
      while (!snap2.empty) {
        result.iterationsBookings += 1;
        if (!dryRun) {
          const batch = db.batch();
          for (const doc of snap2.docs) {
            batch.delete(doc.ref);
            result.deletedBookings += 1;
          }
          await batch.commit();
        } else {
          result.deletedBookings += snap2.docs.length;
        }
        if (snap2.docs.length < CHUNK_SIZE) break;
        const last = snap2.docs[snap2.docs.length - 1];
        q2 = bookingsRef.where(field, "==", clientId).limit(CHUNK_SIZE).startAfter(last);
        snap2 = await q2.get();
      }
    }
    for (const variant of [clientIdDigitsOnly, clientIdNormalizedPhone].filter((v) => v && v !== clientId)) {
      for (const field of ["clientId", "customerPhone"] as const) {
        let q2 = bookingsRef.where(field, "==", variant).limit(CHUNK_SIZE);
        let snap2 = await q2.get();
        while (!snap2.empty) {
          result.iterationsBookings += 1;
          if (!dryRun) {
            const batch = db.batch();
            for (const doc of snap2.docs) {
              batch.delete(doc.ref);
              result.deletedBookings += 1;
            }
            await batch.commit();
          } else {
            result.deletedBookings += snap2.docs.length;
          }
          if (snap2.docs.length < CHUNK_SIZE) break;
          const last = snap2.docs[snap2.docs.length - 1];
          q2 = bookingsRef.where(field, "==", variant).limit(CHUNK_SIZE).startAfter(last);
          snap2 = await q2.get();
        }
      }
    }
  }

  // 2) Delete archivedServiceTypes: sites/{siteId}/clients/{clientId}/archivedServiceTypes
  // Use exact collection name from firestorePaths (clientArchivedServiceTypesCollection).
  // When clientId is provided, delete under clientId and all plausible variants (leading zero, digits-only, etc.)
  // so we cover both "0545408814" and "545408814" style doc ids used by the UI.
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  const subcollectionName = ARCHIVED_SERVICE_TYPES_COLLECTION;

  async function deleteArchivedForClientKeyAsync(key: string): Promise<number> {
    const path = `sites/${siteId}/clients/${key}/${subcollectionName}`;
    const archiveRef = clientsRef.doc(key).collection(subcollectionName);
    let total = 0;
    let archQuery = archiveRef.limit(CHUNK_SIZE);
    let archSnap = await archQuery.get();
    while (!archSnap.empty) {
      result.iterationsArchived += 1;
      const count = archSnap.docs.length;
      total += count;
      if (!dryRun) {
        const batch = db.batch();
        for (const doc of archSnap.docs) {
          batch.delete(doc.ref);
          result.deletedArchivedServiceTypes += 1;
        }
        await batch.commit();
      } else {
        result.deletedArchivedServiceTypes += count;
      }
      if (archSnap.docs.length < CHUNK_SIZE) break;
      const last = archSnap.docs[archSnap.docs.length - 1];
      archQuery = archiveRef.limit(CHUNK_SIZE).startAfter(last);
      archSnap = await archQuery.get();
    }
    if (result.deletedByPath) result.deletedByPath[path] = (result.deletedByPath[path] ?? 0) + total;
    return total;
  }

  if (clientId) {
    const keysToDelete = [
      clientId,
      clientIdDigitsOnly,
      clientIdNormalizedPhone,
      clientIdStripLeadingZero,
      clientIdWithLeadingZero,
    ].filter((k): k is string => !!k && typeof k === "string");
    const seen = new Set<string>();
    for (const key of keysToDelete) {
      if (seen.has(key)) continue;
      seen.add(key);
      await deleteArchivedForClientKeyAsync(key);
    }
  } else {
    // All clients: list clients in chunks, then for each client delete archivedServiceTypes
    let clientsQuery = clientsRef.limit(100);
    let clientsSnap = await clientsQuery.get();
    while (!clientsSnap.empty) {
      for (const clientDoc of clientsSnap.docs) {
        const cid = clientDoc.id;
        const path = `sites/${siteId}/clients/${cid}/${subcollectionName}`;
        const archiveRef = clientsRef.doc(cid).collection(subcollectionName);
        let archQuery = archiveRef.limit(CHUNK_SIZE);
        let archSnap = await archQuery.get();
        let totalForClient = 0;
        while (!archSnap.empty) {
          result.iterationsArchived += 1;
          const count = archSnap.docs.length;
          totalForClient += count;
          if (!dryRun) {
            const batch = db.batch();
            for (const doc of archSnap.docs) {
              batch.delete(doc.ref);
              result.deletedArchivedServiceTypes += 1;
            }
            await batch.commit();
          } else {
            result.deletedArchivedServiceTypes += count;
          }
          if (archSnap.docs.length < CHUNK_SIZE) break;
          const last = archSnap.docs[archSnap.docs.length - 1];
          archQuery = archiveRef.limit(CHUNK_SIZE).startAfter(last);
          archSnap = await archQuery.get();
        }
        if (totalForClient > 0 && result.deletedByPath) {
          result.deletedByPath[path] = (result.deletedByPath[path] ?? 0) + totalForClient;
        }
      }
      if (clientsSnap.docs.length < 100) break;
      const last = clientsSnap.docs[clientsSnap.docs.length - 1];
      clientsQuery = clientsRef.limit(100).startAfter(last);
      clientsSnap = await clientsQuery.get();
    }
  }

  return result;
}
