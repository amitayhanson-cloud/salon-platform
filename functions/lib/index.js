"use strict";
/**
 * Firebase Cloud Functions for Caleno
 * - expiredBookingsCleanup: daily deletion of past bookings (date < today in site TZ)
 * - runExpiredCleanupForSite: callable for dev/test (admin only)
 * - deleteArchivedBookings: callable to delete cancelled (+ legacy expired) bookings (admin only)
 * - scheduledArchiveCleanup: weekly scheduled deletion per site archiveRetention
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledArchiveCleanup = exports.deleteArchivedBookings = exports.runExpiredCleanupForSite = exports.expiredBookingsCleanup = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const BATCH_SIZE = 400;
const TZ = "Asia/Jerusalem";
/**
 * Deterministic archive doc id. clientKey = clientId ?? customerPhone ?? "unknown".
 * If no serviceTypeId: docId = clientKey__unknown__bookingId (do not delete others).
 */
function getDeterministicArchiveDocId(clientId, customerPhone, serviceTypeId, bookingId) {
    const clientKey = (clientId != null && String(clientId).trim() !== "" ? String(clientId).trim() : null) ??
        (customerPhone != null && String(customerPhone).trim() !== "" ? String(customerPhone).trim() : null) ??
        "unknown";
    const serviceTypeKey = serviceTypeId != null && String(serviceTypeId).trim() !== ""
        ? String(serviceTypeId).trim()
        : null;
    if (serviceTypeKey) {
        return { docId: `${clientKey}__${serviceTypeKey}`, shouldDeleteOthers: true };
    }
    return { docId: `${clientKey}__unknown__${bookingId}`, shouldDeleteOthers: false };
}
/** True if this booking is a follow-up (phase 2); should be deleted without archiving. */
function isFollowUpBooking(data) {
    const v = data.parentBookingId;
    return v != null && String(v).trim() !== "";
}
/**
 * Returns YYYY-MM-DD for "today" in the given timezone.
 */
function getTodayYMDInTimezone(tz) {
    try {
        return new Date().toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
    }
    catch {
        return new Date().toISOString().slice(0, 10);
    }
}
const FIRESTORE_BATCH_LIMIT = 500;
/**
 * Core cleanup logic: delete bookings with date < todayYMD in site TZ.
 * Main bookings: archive with statusAtArchive = originalStatus (preserve cancelled for Cancelled page).
 * Follow-ups: delete only, do not archive.
 */
async function runPastBookingsCleanupForSite(siteId, siteTz, dateOverride) {
    const todayYMD = dateOverride ?? getTodayYMDInTimezone(siteTz);
    const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
    const clientsRef = db.collection("sites").doc(siteId).collection("clients");
    const archivePayload = {
        isArchived: true,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedReason: "auto",
    };
    let archived = 0;
    let deletedOnly = 0;
    let minDate = null;
    let maxDate = null;
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
            if (d.isArchived === true)
                continue;
            const dateStr = d.date ?? d.dateISO ?? "";
            if (dateStr) {
                if (minDate == null || dateStr < minDate)
                    minDate = dateStr;
                if (maxDate == null || dateStr > maxDate)
                    maxDate = dateStr;
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
            const clientId = d.clientId ?? null;
            const customerPhone = (d.customerPhone ?? d.phone ?? "").trim() || "";
            const serviceTypeId = d.serviceTypeId ?? d.serviceType ?? null;
            const { docId: deterministicId } = getDeterministicArchiveDocId(clientId, customerPhone, serviceTypeId, doc.id);
            const clientKey = (clientId != null && String(clientId).trim() !== "")
                ? String(clientId).trim()
                : customerPhone || "unknown";
            const minimal = {
                date: dateStr,
                serviceName: d.serviceName ?? "",
                serviceType: d.serviceType ?? null,
                serviceTypeId: d.serviceTypeId ?? null,
                workerId: d.workerId ?? null,
                workerName: d.workerName ?? null,
                customerPhone,
                customerName: d.customerName ?? d.name ?? "",
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
            }
            catch (e) {
                errors++;
                if (process.env.GCLOUD_PROJECT)
                    console.error("[expiredBookingsCleanup] batch commit error", { siteId, error: e });
            }
        }
        if (snapshot.docs.length < BATCH_SIZE)
            break;
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
exports.expiredBookingsCleanup = functions.pubsub
    .schedule("0 2 * * *")
    .timeZone(TZ)
    .onRun(async () => {
    const sitesSnap = await db.collection("sites").get();
    for (const siteDoc of sitesSnap.docs) {
        const siteId = siteDoc.id;
        const siteData = siteDoc.data();
        const siteTz = siteData.config?.archiveRetention?.timezone ||
            siteData.config?.timezone ||
            TZ;
        const cleanupRef = db.collection("sites").doc(siteId).collection("settings").doc("cleanup");
        const todayYMD = getTodayYMDInTimezone(siteTz);
        const cleanupSnap = await cleanupRef.get();
        const data = cleanupSnap.exists ? cleanupSnap.data() : {};
        const lastRunYMD = data.lastExpiredCleanupRunAt?.slice(0, 10);
        if (lastRunYMD === todayYMD)
            continue;
        const result = await runPastBookingsCleanupForSite(siteId, siteTz);
        await cleanupRef.set({ lastExpiredCleanupRunAt: new Date().toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
exports.runExpiredCleanupForSite = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid)
        throw new functions.https.HttpsError("unauthenticated", "חובה להתחבר");
    const { siteId, dateOverride } = data || {};
    if (!siteId || typeof siteId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "חסר מזהה אתר");
    }
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
        throw new functions.https.HttpsError("not-found", "האתר לא נמצא");
    }
    const ownerUid = siteDoc.data()?.ownerUid;
    if (ownerUid !== uid) {
        throw new functions.https.HttpsError("permission-denied", "אין הרשאה");
    }
    const siteData = siteDoc.data();
    const siteTz = siteData.config?.archiveRetention?.timezone ||
        siteData.config?.timezone ||
        TZ;
    const result = await runPastBookingsCleanupForSite(siteId, siteTz, dateOverride);
    if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log("[runExpiredCleanupForSite]", { siteId, dateOverride, ...result });
    }
    return result;
});
/**
 * Callable: Permanently delete all archived (cancelled + expired) bookings for a site.
 * Only site owner can call. Returns { deletedCancelled, deletedExpired }.
 */
exports.deleteArchivedBookings = functions.https.onCall(async (data, context) => {
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
    const ownerUid = siteDoc.data()?.ownerUid;
    if (ownerUid !== uid) {
        console.error("[deleteArchivedBookings] forbidden", { siteId, uid, ownerUid });
        throw new functions.https.HttpsError("permission-denied", "אין הרשאה למחוק תורים באתר זה");
    }
    const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
    let deletedCancelled = 0;
    let deletedExpired = 0;
    const statuses = ["cancelled", "canceled", "cancelled_by_salon", "no_show", "expired"];
    let q = bookingsRef
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
            const status = doc.data().status;
            if (status === "expired")
                deletedExpired++;
            else
                deletedCancelled++;
        }
        await batch.commit();
        if (snapshot.docs.length < BATCH_SIZE)
            break;
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
});
/**
 * Scheduled job: check each site's archiveRetention and run deletion when enabled and time matches.
 */
exports.scheduledArchiveCleanup = functions.pubsub
    .schedule("every 1 hours")
    .timeZone("UTC")
    .onRun(async () => {
    const sitesSnap = await db.collection("sites").get();
    const now = new Date();
    for (const siteDoc of sitesSnap.docs) {
        const siteId = siteDoc.id;
        const config = siteDoc.data().config;
        const retention = config?.archiveRetention;
        if (!retention?.autoDeleteEnabled || retention.frequency !== "weekly")
            continue;
        const tz = retention.timezone || "Asia/Jerusalem";
        let siteNow;
        try {
            siteNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
        }
        catch {
            siteNow = now;
        }
        const currentWeekday = siteNow.getDay();
        const currentHour = siteNow.getHours();
        const currentMinute = siteNow.getMinutes();
        if (currentWeekday !== retention.weekday)
            continue;
        const diffMin = Math.abs(currentHour * 60 + currentMinute - (retention.hour * 60 + retention.minute));
        if (diffMin > 5)
            continue;
        const lastRun = retention.lastRunAt ? new Date(retention.lastRunAt).getTime() : 0;
        if (Date.now() - lastRun < 23 * 60 * 60 * 1000)
            continue;
        const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
        const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - (retention.olderThanDays ?? 30) * 24 * 60 * 60 * 1000));
        let deleted = 0;
        const runDelete = async (statusList, tsField) => {
            let q;
            if (retention.deleteScope === "olderThanDays" && tsField) {
                q = bookingsRef
                    .where("status", "in", statusList)
                    .where(tsField, "<", cutoff)
                    .orderBy(tsField)
                    .orderBy(admin.firestore.FieldPath.documentId())
                    .limit(BATCH_SIZE);
            }
            else {
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
                if (snapshot.docs.length < BATCH_SIZE)
                    break;
                const last = snapshot.docs[snapshot.docs.length - 1];
                if (retention.deleteScope === "olderThanDays" && tsField) {
                    q = bookingsRef
                        .where("status", "in", statusList)
                        .where(tsField, "<", cutoff)
                        .orderBy(tsField)
                        .orderBy(admin.firestore.FieldPath.documentId())
                        .startAfter(last)
                        .limit(BATCH_SIZE);
                }
                else {
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
        }
        else {
            await runDelete(["cancelled", "canceled", "cancelled_by_salon", "no_show", "expired"]);
        }
        const updatedRetention = {
            ...retention,
            lastRunAt: new Date().toISOString(),
        };
        await siteDoc.ref.set({ config: { ...config, archiveRetention: updatedRetention } }, { merge: true });
        console.log("[scheduledArchiveCleanup]", { siteId, deleted, mode: "scheduled" });
    }
    return null;
});
