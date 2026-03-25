/**
 * Shared past-bookings cleanup logic. Used by:
 * - POST /api/admin/run-booking-cleanup (dev/test)
 * - Firebase scheduled job expiredBookingsCleanup (via functions)
 */

import admin from "firebase-admin";
import type { DocumentReference, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDeterministicArchiveDocId } from "./archiveReplaceAdmin";
import { getServiceTypeKey } from "./archiveReplace";
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
    type Op =
      | { kind: "followup"; bookingRef: DocumentReference }
      | {
          kind: "archive";
          bookingRef: DocumentReference;
          clientKey: string;
          deterministicId: string;
          minimal: Record<string, unknown>;
          serviceTypeKey: string | null;
        };

    const ops: Op[] = [];

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
        ops.push({ kind: "followup", bookingRef: bookingsRef.doc(doc.id) });
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
      const serviceTypeKey =
        serviceTypeId != null && String(serviceTypeId).trim() !== "" ? String(serviceTypeId).trim() : null;
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
      ops.push({ kind: "archive", bookingRef: bookingsRef.doc(doc.id), clientKey, deterministicId, minimal, serviceTypeKey });
    }

    const archiveClientKeys = new Set(
      ops.filter((o): o is Extract<Op, { kind: "archive" }> => o.kind === "archive").map((o) => o.clientKey)
    );
    const archiveByClient = new Map<string, QueryDocumentSnapshot[]>();
    if (!dryRun) {
      for (const ck of archiveClientKeys) {
        archiveByClient.set(ck, (await clientsRef.doc(ck).collection("archivedServiceTypes").get()).docs);
      }
    }

    const stalePath = new Set<string>();
    const staleRefs: DocumentReference[] = [];
    if (!dryRun) {
      for (const o of ops) {
        if (o.kind !== "archive" || !o.serviceTypeKey) continue;
        for (const ad of archiveByClient.get(o.clientKey) ?? []) {
          if (ad.id === o.deterministicId) continue;
          if (getServiceTypeKey(ad.data() as Record<string, unknown>) === o.serviceTypeKey) {
            const p = ad.ref.path;
            if (!stalePath.has(p)) {
              stalePath.add(p);
              staleRefs.push(ad.ref);
            }
          }
        }
      }
    }

    let batch = db.batch();
    let batchCount = 0;

    const flushBatch = async () => {
      if (batchCount === 0) return;
      try {
        await batch.commit();
      } catch {
        errors++;
      }
      batch = db.batch();
      batchCount = 0;
    };

    if (!dryRun) {
      for (const ref of staleRefs) {
        if (batchCount >= FIRESTORE_BATCH_LIMIT) await flushBatch();
        batch.delete(ref);
        batchCount++;
      }
    }

    for (const o of ops) {
      if (o.kind === "followup") {
        skippedFollowups++;
        if (!dryRun) {
          if (batchCount >= FIRESTORE_BATCH_LIMIT) await flushBatch();
          batch.delete(o.bookingRef);
          batchCount++;
        }
        continue;
      }
      archived++;
      if (!dryRun) {
        if (batchCount + 2 > FIRESTORE_BATCH_LIMIT) await flushBatch();
        batch.delete(o.bookingRef);
        batch.set(
          clientsRef.doc(o.clientKey).collection("archivedServiceTypes").doc(o.deterministicId),
          o.minimal,
          { merge: false }
        );
        batchCount += 2;
      }
    }

    if (!dryRun && batchCount > 0) {
      try {
        await batch.commit();
      } catch {
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
