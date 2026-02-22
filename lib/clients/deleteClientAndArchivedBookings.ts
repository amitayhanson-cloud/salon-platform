/**
 * Delete a client and all related data (bookings, archived, subcollections).
 * Server-only: uses Firebase Admin SDK.
 *
 * Steps:
 * 1) Delete ALL bookings for this client from sites/{siteId}/bookings (active + archived)
 * 2) Use recursiveDelete on the client doc - deletes the document AND all subcollections
 *    (chemicalCard, personalPricing, archivedServiceTypes)
 *
 * All operations are scoped to siteId. No cross-tenant leakage.
 */

import type { Firestore } from "firebase-admin/firestore";

const BATCH_SIZE = 400;

/**
 * Delete all bookings for a client from sites/{siteId}/bookings.
 * Queries by customerPhone and clientId (legacy) to cover all formats.
 * Returns the number of deleted bookings.
 */
async function deleteClientBookings(
  db: Firestore,
  siteId: string,
  clientId: string
): Promise<number> {
  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
  let totalDeleted = 0;

  for (const field of ["customerPhone", "clientId"] as const) {
    let snapshot = await bookingsRef.where(field, "==", clientId).limit(BATCH_SIZE).get();
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((d) => {
        batch.delete(d.ref);
        totalDeleted++;
      });
      await batch.commit();
      snapshot = await bookingsRef.where(field, "==", clientId).limit(BATCH_SIZE).get();
    }
  }
  return totalDeleted;
}

export interface DeleteResult {
  ok: true;
  deletedBookingsCount: number;
}

export interface DeleteError {
  ok: false;
  message: string;
}

/**
 * Fully delete a client: all bookings + client document + all subcollections.
 * Single definitive action - no partial/soft delete.
 */
export async function deleteClientAndArchivedBookings(
  db: Firestore,
  siteId: string,
  clientId: string
): Promise<DeleteResult | DeleteError> {
  if (!siteId?.trim() || !clientId?.trim()) {
    return { ok: false, message: "siteId and clientId are required" };
  }

  const clientRef = db
    .collection("sites")
    .doc(siteId)
    .collection("clients")
    .doc(clientId);

  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    return { ok: false, message: "client not found" };
  }

  const deletedBookingsCount = await deleteClientBookings(db, siteId, clientId);

  // recursiveDelete removes the client document AND all subcollections
  // (chemicalCard, personalPricing, archivedServiceTypes) in one operation
  await db.recursiveDelete(clientRef);

  return { ok: true, deletedBookingsCount };
}
