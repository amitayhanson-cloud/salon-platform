/**
 * Shared past-bookings cleanup logic. Used by:
 * - POST /api/admin/run-booking-cleanup (dev/test)
 * - Firebase scheduled job expiredBookingsCleanup (via functions)
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { getDeterministicArchiveDocId } from "./archiveReplaceAdmin";
import { getDateYMDInTimezone } from "./expiredCleanupUtils";

const FieldPath = admin.firestore.FieldPath;

function isFollowUpBooking(data: Record<string, unknown>): boolean {
  const v = data.parentBookingId;
  return v != null && String(v).trim() !== "";
}

export type RunPastBookingsCleanupOptions = {
  siteTz: string;
  beforeDate?: string;
  dryRun?: boolean;
};

export type RunPastBookingsCleanupResult = {
  scanned: number;
  deleted: number;
  archived: number;
  skippedFollowups: number;
  errors: number;
  minDate: string | null;
  maxDate: string | null;
};

const BATCH_SIZE = 400;
const FIRESTORE_BATCH_LIMIT = 500;

export async function runPastBookingsCleanup(
  db: Firestore,
  siteId: string,
  options: RunPastBookingsCleanupOptions
): Promise<RunPastBookingsCleanupResult> {
  const { siteTz, beforeDate, dryRun = false } = options;
  const todayYMD = beforeDate ?? getDateYMDInTimezone(new Date(), siteTz);

  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");

  const { FieldValue } = await import("firebase-admin/firestore");
  const archivePayload = {
    isArchived: true,
    archivedAt: FieldValue.serverTimestamp(),
    archivedReason: "auto" as const,
  };

  let scanned = 0;
  let archived = 0;
  let skippedFollowups = 0;
  let errors = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  let q = bookingsRef
    .where("date", "<", todayYMD)
    .orderBy("date", "asc")
    .orderBy(FieldPath.documentId())
    .limit(BATCH_SIZE);

  let snapshot = await q.get();

  while (!snapshot.empty) {
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      scanned++;
      const d = doc.data() as Record<string, unknown>;
      if (d.isArchived === true) continue;

      const dateStr = ((d.date as string) ?? (d.dateISO as string) ?? "") as string;
      if (dateStr) {
        if (minDate == null || dateStr < minDate) minDate = dateStr;
        if (maxDate == null || dateStr > maxDate) maxDate = dateStr;
      }

      if (isFollowUpBooking(d)) {
        if (!dryRun) {
          batch.delete(bookingsRef.doc(doc.id));
          batchCount++;
        }
        skippedFollowups++;
        continue;
      }

      const statusAtArchive =
        d.status != null && String(d.status).trim() !== ""
          ? String(d.status).trim()
          : "booked";
      const clientId = (d.clientId as string) ?? null;
      const customerPhone = (
        ((d.customerPhone as string) ?? (d.phone as string) ?? "") as string
      ).trim();
      const serviceTypeId =
        (d.serviceTypeId as string) ?? (d.serviceType as string) ?? null;
      const { docId: deterministicId } = getDeterministicArchiveDocId(
        clientId,
        customerPhone,
        serviceTypeId,
        doc.id
      );
      const clientKey =
        clientId != null && String(clientId).trim() !== ""
          ? String(clientId).trim()
          : customerPhone || "unknown";
      const minimal: Record<string, unknown> = {
        date: dateStr,
        serviceName: (d.serviceName as string) ?? "",
        serviceType: (d.serviceType as string) ?? null,
        serviceTypeId: (d.serviceTypeId as string) ?? null,
        workerId: (d.workerId as string) ?? null,
        workerName: (d.workerName as string) ?? null,
        customerPhone,
        customerName: (d.customerName as string) ?? (d.name as string) ?? "",
        clientId,
        ...archivePayload,
        statusAtArchive,
      };

      if (!dryRun) {
        if (batchCount + 2 > FIRESTORE_BATCH_LIMIT) {
          try {
            await batch.commit();
          } catch (e) {
            errors++;
          }
          batch = db.batch();
          batchCount = 0;
        }
        batch.delete(bookingsRef.doc(doc.id));
        batch.set(
          clientsRef.doc(clientKey).collection("archivedServiceTypes").doc(deterministicId),
          minimal,
          { merge: false }
        );
        batchCount += 2;
      }
      archived++;
    }

    if (!dryRun && batchCount > 0) {
      try {
        await batch.commit();
      } catch (e) {
        errors++;
      }
    }

    if (snapshot.docs.length < BATCH_SIZE) break;
    const last = snapshot.docs[snapshot.docs.length - 1];
    q = bookingsRef
      .where("date", "<", todayYMD)
      .orderBy("date", "asc")
      .orderBy(FieldPath.documentId())
      .startAfter(last)
      .limit(BATCH_SIZE);
    snapshot = await q.get();
  }

  return {
    scanned,
    deleted: dryRun ? 0 : archived + skippedFollowups,
    archived,
    skippedFollowups,
    errors,
    minDate,
    maxDate,
  };
}
