/**
 * Firebase Cloud Functions for Caleno
 * - expiredBookingsCleanup: daily deletion of past bookings (date < today in site TZ)
 * - runExpiredCleanupForSite: callable for dev/test (admin only)
 * - deleteArchivedBookings: callable to delete cancelled (+ legacy expired) bookings (admin only)
 * - scheduledArchiveCleanup: weekly scheduled deletion per site archiveRetention
 * - liveStatsOnBookingWrite / liveStatsOnClientCreate: increment dashboardCurrent (FieldValue.increment)
 * - auditWhatsAppUsage: onCreate whatsapp_logs → increment dashboardCurrent whatsappCount (billing truth)
 * - waitlistPastDatesCleanup: daily delete bookingWaitlistEntries with preferredDateYmd before today (site TZ)
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { updateLiveStats } from "./liveStatsScorekeeper";
import {
  liveStatsDeltaForBookingCreated,
  liveStatsDeltaForActiveCancellation,
  isDocCancelled,
} from "./liveBookingAnalytics";
import { getDateYMDInTimezone } from "./expiredCleanupUtilsForFunctions";

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

function getServiceTypeKey(d: Record<string, unknown>): string {
  const v = (d.serviceTypeId as string) ?? (d.serviceType as string);
  return v != null && String(v).trim() !== "" ? String(v).trim() : "unknown";
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
    type Op =
      | { kind: "followup"; bookingRef: FirebaseFirestore.DocumentReference }
      | {
          kind: "archive";
          bookingRef: FirebaseFirestore.DocumentReference;
          clientKey: string;
          deterministicId: string;
          minimal: Record<string, unknown>;
          serviceTypeKey: string | null;
        };

    const ops: Op[] = [];

    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (d.isArchived === true) continue;

      const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
      if (dateStr) {
        if (minDate == null || dateStr < minDate) minDate = dateStr;
        if (maxDate == null || dateStr > maxDate) maxDate = dateStr;
      }

      if (isFollowUpBooking(d)) {
        ops.push({ kind: "followup", bookingRef: bookingsRef.doc(doc.id) });
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
      ops.push({
        kind: "archive",
        bookingRef: bookingsRef.doc(doc.id),
        clientKey,
        deterministicId,
        minimal,
        serviceTypeKey,
      });
    }

    const archiveClientKeys = new Set(
      ops.filter((o): o is Extract<Op, { kind: "archive" }> => o.kind === "archive").map((o) => o.clientKey)
    );
    const archiveByClient = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    for (const ck of archiveClientKeys) {
      const snap = await clientsRef.doc(ck).collection("archivedServiceTypes").get();
      archiveByClient.set(ck, snap.docs);
    }

    const stalePath = new Set<string>();
    const staleRefs: FirebaseFirestore.DocumentReference[] = [];
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

    let batch = db.batch();
    let batchCount = 0;
    const flushBatch = async () => {
      if (batchCount === 0) return;
      try {
        await batch.commit();
      } catch (e) {
        errors++;
        if (process.env.GCLOUD_PROJECT) console.error("[expiredBookingsCleanup] batch commit error", { siteId, error: e });
      }
      batch = db.batch();
      batchCount = 0;
    };

    for (const ref of staleRefs) {
      if (batchCount >= FIRESTORE_BATCH_LIMIT) await flushBatch();
      batch.delete(ref);
      batchCount++;
    }

    for (const o of ops) {
      if (o.kind === "followup") {
        if (batchCount >= FIRESTORE_BATCH_LIMIT) await flushBatch();
        batch.delete(o.bookingRef);
        batchCount++;
        deletedOnly++;
        continue;
      }
      if (batchCount + 2 > FIRESTORE_BATCH_LIMIT) await flushBatch();
      batch.delete(o.bookingRef);
      batch.set(
        clientsRef.doc(o.clientKey).collection("archivedServiceTypes").doc(o.deterministicId),
        o.minimal,
        { merge: false }
      );
      batchCount += 2;
      archived++;
    }

    await flushBatch();

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
 * Delete waitlist rows whose preferred calendar day is strictly before "today" in the site timezone.
 */
async function deleteExpiredWaitlistEntriesForSite(siteId: string, siteTz: string): Promise<number> {
  const todayYmd = getTodayYMDInTimezone(siteTz);
  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
  let total = 0;
  let q: admin.firestore.Query = col
    .where("preferredDateYmd", "<", todayYmd)
    .orderBy("preferredDateYmd", "asc")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(FIRESTORE_BATCH_LIMIT);
  let snapshot = await q.get();
  while (!snapshot.empty) {
    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    total += snapshot.docs.length;
    if (snapshot.docs.length < FIRESTORE_BATCH_LIMIT) break;
    const last = snapshot.docs[snapshot.docs.length - 1];
    q = col
      .where("preferredDateYmd", "<", todayYmd)
      .orderBy("preferredDateYmd", "asc")
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAfter(last)
      .limit(FIRESTORE_BATCH_LIMIT);
    snapshot = await q.get();
  }
  return total;
}

/** Daily after booking expiry cleanup: drop stale waitlist signups for past dates. */
export const waitlistPastDatesCleanup = functions.pubsub
  .schedule("20 2 * * *")
  .timeZone(TZ)
  .onRun(async () => {
    const sitesSnap = await db.collection("sites").get();
    for (const siteDoc of sitesSnap.docs) {
      const siteId = siteDoc.id;
      const siteData = siteDoc.data() as {
        config?: { archiveRetention?: { timezone?: string }; timezone?: string };
      };
      const siteTz =
        siteData.config?.archiveRetention?.timezone ||
        siteData.config?.timezone ||
        TZ;
      try {
        const deleted = await deleteExpiredWaitlistEntriesForSite(siteId, siteTz);
        if (deleted > 0) {
          console.log("[waitlistPastDatesCleanup]", {
            siteId,
            deleted,
            todayYmd: getTodayYMDInTimezone(siteTz),
            siteTz,
          });
        }
      } catch (e) {
        console.error("[waitlistPastDatesCleanup]", { siteId, error: e });
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

/**
 * Booking writes (public + admin): mirrors lib/liveStatsBookingDeltas — must stay in sync.
 */
export const liveStatsOnBookingWrite = functions.firestore
  .document("sites/{siteId}/bookings/{bookingId}")
  .onWrite(async (change, context) => {
    const siteId = context.params.siteId as string;
    const before = change.before.exists ? (change.before.data() as Record<string, unknown>) : null;
    const after = change.after.exists ? (change.after.data() as Record<string, unknown>) : null;

    try {
      if (!before && after) {
        const pack = liveStatsDeltaForBookingCreated(after);
        if (pack) await updateLiveStats(db, siteId, pack.ymd, pack.delta, pack.trafficSourceDeltas);
        return;
      }

      if (before && after) {
        const wasCancelled = isDocCancelled(before);
        const nowCancelled = isDocCancelled(after);
        if (!wasCancelled && nowCancelled) {
          const pack = liveStatsDeltaForActiveCancellation(before);
          if (pack) {
            await updateLiveStats(db, siteId, pack.ymd, pack.delta, pack.trafficSourceDeltas);
          }
        }
      }
    } catch (e) {
      console.error("[liveStatsOnBookingWrite]", { siteId, error: e });
    }
  });

/** New client profile (phone doc created). */
export const liveStatsOnClientCreate = functions.firestore
  .document("sites/{siteId}/clients/{clientId}")
  .onCreate(async (snap, context) => {
    const siteId = context.params.siteId as string;
    const data = snap.data() as Record<string, unknown>;
    let ymd: string;
    const ca = data.createdAt as admin.firestore.Timestamp | undefined;
    if (ca && typeof ca.toDate === "function") {
      try {
        ymd = getDateYMDInTimezone(ca.toDate(), TZ);
      } catch {
        ymd = getDateYMDInTimezone(new Date(), TZ);
      }
    } else {
      ymd = getDateYMDInTimezone(new Date(), TZ);
    }
    try {
      await updateLiveStats(db, siteId, ymd, { newClients: 1 });
    } catch (e) {
      console.error("[liveStatsOnClientCreate]", { siteId, error: e });
    }
  });

/**
 * Master auditor: each outbound WhatsApp receipt in whatsapp_logs bumps dashboard WhatsApp counts once.
 * Uses the same day buckets + totals as booking/client live stats.
 */
export const auditWhatsAppUsage = functions.firestore
  .document("sites/{siteId}/whatsapp_logs/{logId}")
  .onCreate(async (snap, context) => {
    const siteId = context.params.siteId as string;
    const data = snap.data() as Record<string, unknown>;
    const ts = data?.createdAt as admin.firestore.Timestamp | undefined;
    let ymd: string;
    if (ts && typeof ts.toDate === "function") {
      try {
        ymd = getDateYMDInTimezone(ts.toDate(), TZ);
      } catch {
        ymd = getDateYMDInTimezone(new Date(), TZ);
      }
    } else {
      ymd = getDateYMDInTimezone(new Date(), TZ);
    }
    try {
      await updateLiveStats(db, siteId, ymd, { whatsappCount: 1 });
      console.log("[auditWhatsAppUsage]", { siteId, logId: context.params.logId, ymd, type: data?.type });
    } catch (e) {
      console.error("[auditWhatsAppUsage]", { siteId, error: e });
    }
  });

/**
 * Backup waitlist match when a booking doc is deleted (e.g. console delete). In-app cascade already notifies;
 * slot lock prevents duplicate offers when both run. Requires CALENO_APP_BASE_URL + CALENO_WAITLIST_INTERNAL_SECRET.
 */
export const waitlistOnBookingDeleted = functions.firestore
  .document("sites/{siteId}/bookings/{bookingId}")
  .onDelete(async (snap, context) => {
    const baseUrl = process.env.CALENO_APP_BASE_URL?.trim();
    const secret = process.env.CALENO_WAITLIST_INTERNAL_SECRET?.trim();
    if (!baseUrl || !secret) return;

    const data = snap.data() as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.phase === 2) return;
    const pid = data.parentBookingId;
    if (pid != null && String(pid).trim() !== "") return;

    const siteId = context.params.siteId as string;
    const url = `${baseUrl.replace(/\/$/, "")}/api/internal/waitlist/trigger-from-release`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-caleno-waitlist-secret": secret,
        },
        body: JSON.stringify({ siteId, bookingData: data }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("[waitlistOnBookingDeleted] upstream_error", { status: res.status, body: t.slice(0, 500) });
      }
    } catch (e) {
      console.error("[waitlistOnBookingDeleted]", { siteId, error: e });
    }
  });
