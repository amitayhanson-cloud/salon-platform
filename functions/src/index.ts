/**
 * Firebase Cloud Functions for Caleno
 * - expiredBookingsCleanup: scheduled deletion of expired (past) bookings per site setting
 * - deleteArchivedBookings: callable to delete cancelled (+ legacy expired) bookings (admin only)
 * - scheduledArchiveCleanup: weekly scheduled deletion per site archiveRetention
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();
const BATCH_SIZE = 400;
const TZ = "Asia/Jerusalem";

type ExpiredAutoDelete = "off" | "daily" | "weekly" | "monthly" | "quarterly";

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
 * Expired = booking date/time is in the past.
 * - If endAt exists: expired if endAt < now
 * - Else if startAt exists: expired if startAt < now
 * - Else if date + time: parse in site TZ, expired if that moment < now
 * - Else if date only: expired if date < today (end of day)
 */
function isBookingExpired(
  data: admin.firestore.DocumentData,
  nowMillis: number,
  todayYMD: string
): boolean {
  const endAt = data.endAt as admin.firestore.Timestamp | undefined;
  if (endAt?.toMillis) return endAt.toMillis() < nowMillis;

  const startAt = data.startAt as admin.firestore.Timestamp | undefined;
  if (startAt?.toMillis) return startAt.toMillis() < nowMillis;

  const dateStr = data.date as string | undefined;
  const timeStr = (data.time ?? data.timeHHmm) as string | undefined;
  if (dateStr && timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const [y, mo, d] = dateStr.split("-").map(Number);
    const bookingEnd = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0, 0, 0);
    const durationMin = data.durationMin ?? data.durationMinutes ?? 60;
    bookingEnd.setMinutes(bookingEnd.getMinutes() + durationMin);
    return bookingEnd.getTime() < nowMillis;
  }

  if (dateStr) return dateStr < todayYMD;
  return false;
}

/**
 * Should we run cleanup today for this site? Uses lastExpiredCleanupRunAt to avoid duplicates.
 */
function shouldRunToday(
  setting: ExpiredAutoDelete,
  now: Date,
  lastRunAt: string | undefined
): boolean {
  const todayYMD = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const lastRunYMD = lastRunAt ? lastRunAt.slice(0, 10) : null;

  if (setting === "off") return false;
  if (setting === "daily") return lastRunYMD !== todayYMD;
  if (setting === "weekly") {
    if (now.getDay() !== 0) return false; // Sunday
    if (!lastRunYMD) return true;
    const last = new Date(lastRunYMD);
    return (now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000) >= 7;
  }
  if (setting === "monthly") {
    if (now.getDate() !== 1) return false;
    if (!lastRunYMD) return true;
    return lastRunYMD.slice(0, 7) !== todayYMD.slice(0, 7);
  }
  if (setting === "quarterly") {
    const month = now.getMonth();
    if (month !== 0 && month !== 3 && month !== 6 && month !== 9) return false;
    if (now.getDate() !== 1) return false;
    if (!lastRunYMD) return true;
    const q = Math.floor(month / 3) + 1;
    const lastQ = Math.floor(new Date(lastRunYMD).getMonth() / 3) + 1;
    const lastYear = lastRunYMD.slice(0, 4);
    const thisYear = todayYMD.slice(0, 4);
    return lastYear !== thisYear || lastQ !== q;
  }
  return false;
}

/**
 * Scheduled job: runs daily at 03:00 Asia/Jerusalem. For each site with expiredAutoDelete != "off",
 * if today is a run day, deletes expired (past) bookings. Uses sites/{siteId}/settings/cleanup.
 */
export const expiredBookingsCleanup = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone(TZ)
  .onRun(async () => {
    const now = new Date();
    const nowMillis = now.getTime();
    const todayYMD =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    const sitesSnap = await db.collection("sites").get();
    for (const siteDoc of sitesSnap.docs) {
      const siteId = siteDoc.id;
      const cleanupRef = db.collection("sites").doc(siteId).collection("settings").doc("cleanup");
      const cleanupSnap = await cleanupRef.get();
      const data = cleanupSnap.exists ? (cleanupSnap.data() as { expiredAutoDelete?: ExpiredAutoDelete; lastExpiredCleanupRunAt?: string }) : {};
      const setting: ExpiredAutoDelete = data.expiredAutoDelete ?? "off";
      const lastRunAt = data.lastExpiredCleanupRunAt;

      if (!shouldRunToday(setting, now, lastRunAt)) continue;

      const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
      let deleted = 0;
      let minDate: string | null = null;
      let maxDate: string | null = null;

      let q = bookingsRef
        .where("date", "<=", todayYMD)
        .orderBy("date", "asc")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(BATCH_SIZE);
      let snapshot = await q.get();

      while (!snapshot.empty) {
        const batch = db.batch();
        let batchCount = 0;
        for (const doc of snapshot.docs) {
          const d = doc.data();
          if (d.isArchived === true) continue; // already archived
          if (!isBookingExpired(d, nowMillis, todayYMD)) continue;
          const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
          const minimal: Record<string, unknown> = {
            date: dateStr,
            serviceName: (d.serviceName as string) ?? "",
            serviceType: (d.serviceType as string) ?? null,
            workerId: (d.workerId as string) ?? null,
            workerName: (d.workerName as string) ?? null,
            customerPhone: (d.customerPhone as string) ?? (d.phone as string) ?? "",
            customerName: (d.customerName as string) ?? (d.name as string) ?? "",
            isArchived: true,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            archivedReason: "auto",
          };
          batch.set(doc.ref, minimal);
          batchCount++;
          deleted++;
          const dateStr = (d.date as string) || "";
          if (dateStr) {
            if (minDate == null || dateStr < minDate) minDate = dateStr;
            if (maxDate == null || dateStr > maxDate) maxDate = dateStr;
          }
        }
        if (batchCount > 0) await batch.commit();
        if (snapshot.docs.length < BATCH_SIZE) break;
        const last = snapshot.docs[snapshot.docs.length - 1];
        q = bookingsRef
          .where("date", "<=", todayYMD)
          .orderBy("date", "asc")
          .orderBy(admin.firestore.FieldPath.documentId())
          .startAfter(last)
          .limit(BATCH_SIZE);
        snapshot = await q.get();
      }

      await cleanupRef.set(
        { lastExpiredCleanupRunAt: new Date().toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      console.log("[expiredBookingsCleanup]", {
        siteId,
        setting,
        deleted,
        minDate: minDate ?? undefined,
        maxDate: maxDate ?? undefined,
      });
    }

    return null;
  });

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
