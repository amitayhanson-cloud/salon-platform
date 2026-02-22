/**
 * Firebase Cloud Functions for Caleno
 * - expiredBookingsCleanup: daily deletion of past bookings (date < today in site TZ)
 * - runExpiredCleanupForSite: callable for dev/test (admin only)
 * - deleteArchivedBookings: callable to delete cancelled (+ legacy expired) bookings (admin only)
 * - scheduledArchiveCleanup: weekly scheduled deletion per site archiveRetention
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();
const BATCH_SIZE = 400;
const TZ = "Asia/Jerusalem";

/**
 * Deterministic archive doc id. clientKey = clientId ?? customerPhone ?? "unknown".
 * If no serviceTypeId: docId = clientKey__unknown__bookingId (do not delete others).
 */
function getDeterministicArchiveDocId(
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


/** True if this booking is a follow-up (phase 2); should be deleted without archiving. */
function isFollowUpBooking(data: admin.firestore.DocumentData): boolean {
  const v = data.parentBookingId;
  return v != null && String(v).trim() !== "";
}

type ArchiveRetention = {
  autoDeleteEnabled: boolean;
  frequency: "weekly";
  weekday: number;
  hour: number;
  minute: number;
  timezone: string;
  deleteScope: "all" | "olderThanDays";
  olderThanDays?: number;
  lastRunAt?: string;
};

/**
 * Returns YYYY-MM-DD for "today" in the given timezone.
 */
function getTodayYMDInTimezone(tz: string): string {
  try {
    return new Date().toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Core cleanup logic: delete bookings with date < todayYMD in site TZ.
 * Main bookings: archive with statusAtArchive = originalStatus (preserve cancelled for Cancelled page).
 * Follow-ups: delete only, do not archive.
 */
async function runPastBookingsCleanupForSite(
  siteId: string,
  siteTz: string,
  dateOverride?: string
): Promise<{ archived: number; deletedOnly: number; minDate: string | null; maxDate: string | null; errors: number }> {
  const todayYMD = dateOverride ?? getTodayYMDInTimezone(siteTz);
  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  const archivePayload = {
    isArchived: true,
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    archivedReason: "auto" as const,
  };

  let archived = 0;
  let deletedOnly = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let errors = 0;

  let q = bookingsRef
    .where("date", "<", todayYMD)
    .orderBy("date", "asc")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(BATCH_SIZE);
  let snapshot = await q.get();

  while (!snapshot.empty) {
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (d.isArchived === true) continue;

      const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
      if (dateStr) {
        if (minDate == null || dateStr < minDate) minDate = dateStr;
        if (maxDate == null || dateStr > maxDate) maxDate = dateStr;
      }

      if (isFollowUpBooking(d)) {
        batch.delete(bookingsRef.doc(doc.id));
        batchCount++;
        deletedOnly++;
        continue;
      }

      const statusAtArchive = (d.status != null && String(d.status).trim())
        ? String(d.status).trim()
        : "booked";
      const clientId = (d.clientId as string) ?? null;
      const customerPhone = ((d.customerPhone as string) ?? (d.phone as string) ?? "").trim() || "";
      const serviceTypeId = (d.serviceTypeId as string) ?? (d.serviceType as string) ?? null;
      const { docId: deterministicId } = getDeterministicArchiveDocId(clientId, customerPhone, serviceTypeId, doc.id);
      const clientKey = (clientId != null && String(clientId).trim() !== "")
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

      if (batchCount + 2 > FIRESTORE_BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
      batch.delete(bookingsRef.doc(doc.id));
      batch.set(clientsRef.doc(clientKey).collection("archivedServiceTypes").doc(deterministicId), minimal, { merge: false });
      batchCount += 2;
      archived++;
    }

    if (batchCount > 0) {
      try {
        await batch.commit();
      } catch (e) {
        errors++;
        if (process.env.GCLOUD_PROJECT) console.error("[expiredBookingsCleanup] batch commit error", { siteId, error: e });
      }
    }

    if (snapshot.docs.length < BATCH_SIZE) break;
    const last = snapshot.docs[snapshot.docs.length - 1];
    q = bookingsRef
      .where("date", "<", todayYMD)
      .orderBy("date", "asc")
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAfter(last)
      .limit(BATCH_SIZE);
    snapshot = await q.get();
  }

  return { archived, deletedOnly, minDate, maxDate, errors };
}

/**
 * Scheduled job: runs daily at 02:00 Asia/Jerusalem. For each site, deletes all bookings
 * with date < today (in site timezone). Idempotent: runs at most once per calendar day per site.
 */
export const expiredBookingsCleanup = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone(TZ)
  .onRun(async () => {
    const sitesSnap = await db.collection("sites").get();
    for (const siteDoc of sitesSnap.docs) {
      const siteId = siteDoc.id;
      const siteData = siteDoc.data() as { config?: { archiveRetention?: { timezone?: string }; timezone?: string } };
      const siteTz =
        siteData.config?.archiveRetention?.timezone ||
        siteData.config?.timezone ||
        TZ;

      const cleanupRef = db.collection("sites").doc(siteId).collection("settings").doc("cleanup");
      const todayYMD = getTodayYMDInTimezone(siteTz);
      const cleanupSnap = await cleanupRef.get();
      const data = cleanupSnap.exists ? (cleanupSnap.data() as { lastExpiredCleanupRunAt?: string }) : {};
      const lastRunYMD = data.lastExpiredCleanupRunAt?.slice(0, 10);
      if (lastRunYMD === todayYMD) continue;

      const result = await runPastBookingsCleanupForSite(siteId, siteTz);
      await cleanupRef.set(
        { lastExpiredCleanupRunAt: new Date().toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" || result.archived > 0 || result.deletedOnly > 0) {
        console.log("[expiredBookingsCleanup]", {
          siteId,
          siteTz,
          todayYMD,
          ...result,
        });
      }
    }
    return null;
  });

/**
 * Callable: run past bookings cleanup for a single site (dev/test). Site owner only.
 */
export const runExpiredCleanupForSite = functions.https.onCall(
  async (data: { siteId: string; dateOverride?: string }, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "חובה להתחבר");

    const { siteId, dateOverride } = data || {};
    if (!siteId || typeof siteId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "חסר מזהה אתר");
    }

    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      throw new functions.https.HttpsError("not-found", "האתר לא נמצא");
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      throw new functions.https.HttpsError("permission-denied", "אין הרשאה");
    }

    const siteData = siteDoc.data() as { config?: { archiveRetention?: { timezone?: string }; timezone?: string } };
    const siteTz =
      siteData.config?.archiveRetention?.timezone ||
      siteData.config?.timezone ||
      TZ;

    const result = await runPastBookingsCleanupForSite(siteId, siteTz, dateOverride);

    if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log("[runExpiredCleanupForSite]", { siteId, dateOverride, ...result });
    }

    return result;
  }
);

/**
 * Callable: Permanently delete all archived (cancelled + expired) bookings for a site.
 * Only site owner can call. Returns { deletedCancelled, deletedExpired }.
 */
export const deleteArchivedBookings = functions.https.onCall(
  async (data: { siteId: string; dayRange?: { start: string; end: string } }, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "חובה להתחבר");
    }

    const { siteId, dayRange } = data || {};
    if (!siteId || typeof siteId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "חסר מזהה אתר");
    }

    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      throw new functions.https.HttpsError("not-found", "האתר לא נמצא");
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      console.error("[deleteArchivedBookings] forbidden", { siteId, uid, ownerUid });
      throw new functions.https.HttpsError("permission-denied", "אין הרשאה למחוק תורים באתר זה");
    }

    const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
    let deletedCancelled = 0;
    let deletedExpired = 0;
    const statuses = ["cancelled", "canceled", "cancelled_by_salon", "no_show", "expired"];

    let q: admin.firestore.Query = bookingsRef
      .where("status", "in", statuses)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(BATCH_SIZE);
    if (dayRange?.start && dayRange?.end) {
      q = q.where("date", ">=", dayRange.start).where("date", "<=", dayRange.end);
    }
    let snapshot = await q.get();
    while (!snapshot.empty) {
      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        const status = (doc.data() as { status?: string }).status;
        if (status === "expired") deletedExpired++;
        else deletedCancelled++;
      }
      await batch.commit();
      if (snapshot.docs.length < BATCH_SIZE) break;
      const last = snapshot.docs[snapshot.docs.length - 1];
      q = bookingsRef
        .where("status", "in", statuses)
        .orderBy(admin.firestore.FieldPath.documentId())
        .startAfter(last)
        .limit(BATCH_SIZE);
      if (dayRange?.start && dayRange?.end) {
        q = q.where("date", ">=", dayRange.start).where("date", "<=", dayRange.end);
      }
      snapshot = await q.get();
    }

    console.log("[deleteArchivedBookings] manual", {
      siteId,
      uid,
      deletedCancelled,
      deletedExpired,
    });
    return { deletedCancelled, deletedExpired };
  }
);

/**
 * Scheduled job: check each site's archiveRetention and run deletion when enabled and time matches.
 */
export const scheduledArchiveCleanup = functions.pubsub
  .schedule("every 1 hours")
  .timeZone("UTC")
  .onRun(async () => {
    const sitesSnap = await db.collection("sites").get();
    const now = new Date();

    for (const siteDoc of sitesSnap.docs) {
      const siteId = siteDoc.id;
      const config = (siteDoc.data() as { config?: { archiveRetention?: ArchiveRetention } }).config;
      const retention = config?.archiveRetention;
      if (!retention?.autoDeleteEnabled || retention.frequency !== "weekly") continue;

      const tz = retention.timezone || "Asia/Jerusalem";
      let siteNow: Date;
      try {
        siteNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
      } catch {
        siteNow = now;
      }
      const currentWeekday = siteNow.getDay();
      const currentHour = siteNow.getHours();
      const currentMinute = siteNow.getMinutes();
      if (currentWeekday !== retention.weekday) continue;
      const diffMin = Math.abs(currentHour * 60 + currentMinute - (retention.hour * 60 + retention.minute));
      if (diffMin > 5) continue;

      const lastRun = retention.lastRunAt ? new Date(retention.lastRunAt).getTime() : 0;
      if (Date.now() - lastRun < 23 * 60 * 60 * 1000) continue;

      const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
      const cutoff = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - (retention.olderThanDays ?? 30) * 24 * 60 * 60 * 1000)
      );
      let deleted = 0;
      const runDelete = async (statusList: string[], tsField?: string) => {
        let q: admin.firestore.Query;
        if (retention.deleteScope === "olderThanDays" && tsField) {
          q = bookingsRef
            .where("status", "in", statusList)
            .where(tsField, "<", cutoff)
            .orderBy(tsField)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(BATCH_SIZE);
        } else {
          q = bookingsRef
            .where("status", "in", statusList)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(BATCH_SIZE);
        }
        let snapshot = await q.get();
        while (!snapshot.empty) {
          const batch = db.batch();
          for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            deleted++;
          }
          await batch.commit();
          if (snapshot.docs.length < BATCH_SIZE) break;
          const last = snapshot.docs[snapshot.docs.length - 1];
          if (retention.deleteScope === "olderThanDays" && tsField) {
            q = bookingsRef
              .where("status", "in", statusList)
              .where(tsField, "<", cutoff)
              .orderBy(tsField)
              .orderBy(admin.firestore.FieldPath.documentId())
              .startAfter(last)
              .limit(BATCH_SIZE);
          } else {
            q = bookingsRef
              .where("status", "in", statusList)
              .orderBy(admin.firestore.FieldPath.documentId())
              .startAfter(last)
              .limit(BATCH_SIZE);
          }
          snapshot = await q.get();
        }
      };
      if (retention.deleteScope === "olderThanDays" && retention.olderThanDays != null) {
        await runDelete(["cancelled", "canceled", "cancelled_by_salon", "no_show"], "cancelledAt");
        await runDelete(["expired"], "expiredAt");
      } else {
        await runDelete(["cancelled", "canceled", "cancelled_by_salon", "no_show", "expired"]);
      }

      const updatedRetention: ArchiveRetention = {
        ...retention,
        lastRunAt: new Date().toISOString(),
      };
      await siteDoc.ref.set(
        { config: { ...config, archiveRetention: updatedRetention } },
        { merge: true }
      );

      console.log("[scheduledArchiveCleanup]", { siteId, deleted, mode: "scheduled" });
    }

    return null;
  }
);
