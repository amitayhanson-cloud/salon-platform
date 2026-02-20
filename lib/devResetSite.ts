/**
 * DEV-ONLY: Full site reset — wipe ALL bookings and client history for a site.
 * Chunked deletes (limit 300) to avoid quota spikes. No filters; deletes everything.
 * Use from API route (with auth + dev check) or CLI script.
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

const CHUNK_SIZE = 300;
const FieldPath = admin.firestore.FieldPath;

/** Subcollection name used by client history UI (firestorePaths.ts). */
const ARCHIVED_SERVICE_TYPES = "archivedServiceTypes";

export interface DevResetSiteResult {
  deletedBookings: number;
  deletedClientsScanned: number;
  deletedArchivedServiceTypeDocs: number;
  deletedOtherHistoryDocs: number;
  iterations: {
    bookings: number;
    archived: number;
  };
  dryRun: boolean;
}

function log(msg: string) {
  console.log(`[dev-reset-site] ${msg}`);
}

/**
 * Wipe all booking and history data for a site. No filters.
 * A) sites/{siteId}/bookings — every doc, chunked (limit 300 per batch).
 * B) For each client in sites/{siteId}/clients — delete archivedServiceTypes subcollection, chunked.
 */
export async function devResetSite(
  db: Firestore,
  siteId: string,
  options: { dryRun?: boolean } = {}
): Promise<DevResetSiteResult> {
  const dryRun = options.dryRun ?? false;
  const result: DevResetSiteResult = {
    deletedBookings: 0,
    deletedClientsScanned: 0,
    deletedArchivedServiceTypeDocs: 0,
    deletedOtherHistoryDocs: 0,
    iterations: { bookings: 0, archived: 0 },
    dryRun,
  };

  const bookingsPath = `sites/${siteId}/bookings`;
  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
  log(`deleting from ${bookingsPath}`);

  // A) Delete ALL docs in sites/{siteId}/bookings — listDocuments first, fallback to query pagination
  let bookingRefs = await bookingsRef.listDocuments();
  if (bookingRefs.length === 0) {
    // Fallback: paginate with orderBy( documentId ).limit(300) until empty (e.g. if listDocuments is empty due to SDK/project)
    let query = bookingsRef.orderBy(FieldPath.documentId()).limit(CHUNK_SIZE);
    let snapshot = await query.get();
    while (!snapshot.empty) {
      result.iterations.bookings += 1;
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
      query = bookingsRef.orderBy(FieldPath.documentId()).limit(CHUNK_SIZE).startAfter(last);
      snapshot = await query.get();
    }
  } else {
    while (bookingRefs.length > 0) {
      const chunk = bookingRefs.slice(0, CHUNK_SIZE);
      result.iterations.bookings += 1;
      if (!dryRun) {
        const batch = db.batch();
        for (const ref of chunk) {
          batch.delete(ref);
          result.deletedBookings += 1;
        }
        await batch.commit();
      } else {
        result.deletedBookings += chunk.length;
      }
      if (chunk.length < CHUNK_SIZE) break;
      bookingRefs = bookingRefs.slice(CHUNK_SIZE);
    }
  }

  const clientsPath = `sites/${siteId}/clients`;
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  log(`scanning clients at ${clientsPath}`);

  // B) For each client, count and delete archivedServiceTypes subcollection
  let clientRefs = await clientsRef.listDocuments();
  if (clientRefs.length === 0) {
    // Fallback: paginate clients with orderBy( documentId ).limit(100)
    let clientsQuery = clientsRef.orderBy(FieldPath.documentId()).limit(100);
    let clientsSnap = await clientsQuery.get();
    while (!clientsSnap.empty) {
      for (const clientDoc of clientsSnap.docs) {
        const clientId = clientDoc.id;
        result.deletedClientsScanned += 1;
        const archivePath = `sites/${siteId}/clients/${clientId}/${ARCHIVED_SERVICE_TYPES}`;
        const archiveRef = clientsRef.doc(clientId).collection(ARCHIVED_SERVICE_TYPES);
        let archQuery = archiveRef.orderBy(FieldPath.documentId()).limit(CHUNK_SIZE);
        let archSnap = await archQuery.get();
        if (archSnap.size > 0) {
          log(`deleting history at ${archivePath}`);
        }
        while (!archSnap.empty) {
          result.iterations.archived += 1;
          if (!dryRun) {
            const batch = db.batch();
            for (const doc of archSnap.docs) {
              batch.delete(doc.ref);
              result.deletedArchivedServiceTypeDocs += 1;
            }
            await batch.commit();
          } else {
            result.deletedArchivedServiceTypeDocs += archSnap.docs.length;
          }
          if (archSnap.docs.length < CHUNK_SIZE) break;
          const last = archSnap.docs[archSnap.docs.length - 1];
          archQuery = archiveRef.orderBy(FieldPath.documentId()).limit(CHUNK_SIZE).startAfter(last);
          archSnap = await archQuery.get();
        }
      }
      if (clientsSnap.docs.length < 100) break;
      const last = clientsSnap.docs[clientsSnap.docs.length - 1];
      clientsQuery = clientsRef.orderBy(FieldPath.documentId()).limit(100).startAfter(last);
      clientsSnap = await clientsQuery.get();
    }
  } else {
    for (const clientRef of clientRefs) {
      const clientId = clientRef.id;
      result.deletedClientsScanned += 1;

      const archivePath = `sites/${siteId}/clients/${clientId}/${ARCHIVED_SERVICE_TYPES}`;
      const archiveRef = clientRef.collection(ARCHIVED_SERVICE_TYPES);
      let archiveDocRefs = await archiveRef.listDocuments();
      if (archiveDocRefs.length > 0) {
        log(`deleting history at ${archivePath}`);
      }

      while (archiveDocRefs.length > 0) {
        result.iterations.archived += 1;
        const chunk = archiveDocRefs.slice(0, CHUNK_SIZE);
        if (!dryRun) {
          const batch = db.batch();
          for (const ref of chunk) {
            batch.delete(ref);
            result.deletedArchivedServiceTypeDocs += 1;
          }
          await batch.commit();
        } else {
          result.deletedArchivedServiceTypeDocs += chunk.length;
        }
        if (chunk.length < CHUNK_SIZE) break;
        archiveDocRefs = archiveDocRefs.slice(CHUNK_SIZE);
      }
    }
  }

  return result;
}
