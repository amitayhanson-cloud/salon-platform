"use strict";
/**
 * Firebase Cloud Functions for Caleno
 * - expiredBookingsCleanup: daily deletion of past bookings (date < today in site TZ)
 * - runExpiredCleanupForSite: callable for dev/test (admin only)
 * - deleteArchivedBookings: callable to delete cancelled (+ legacy expired) bookings (admin only)
 * - scheduledArchiveCleanup: weekly scheduled deletion per site archiveRetention
 * - liveStatsOnBookingWrite / liveStatsOnClientCreate: increment dashboardCurrent (FieldValue.increment)
 * - auditWhatsAppUsage: onCreate whatsapp_logs → increment dashboardCurrent whatsappCount (billing truth)
 * - waitlistPastDatesCleanup: daily delete bookingWaitlistEntries with preferredDateYmd before today (site TZ)
 * - cleanupExpiredWaitlistOffers: every 15m expire pending_offer older than 2h, clear slot lock, rematch via app API
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
exports.waitlistOnBookingDeleted = exports.auditWhatsAppUsage = exports.liveStatsOnClientCreate = exports.liveStatsOnBookingWrite = exports.scheduledArchiveCleanup = exports.deleteArchivedBookings = exports.runExpiredCleanupForSite = exports.cleanupExpiredWaitlistOffers = exports.waitlistPastDatesCleanup = exports.expiredBookingsCleanup = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const liveStatsScorekeeper_1 = require("./liveStatsScorekeeper");
const liveBookingAnalytics_1 = require("./liveBookingAnalytics");
const expiredCleanupUtilsForFunctions_1 = require("./expiredCleanupUtilsForFunctions");
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
function getServiceTypeKey(d) {
    const v = d.serviceTypeId ?? d.serviceType;
    return v != null && String(v).trim() !== "" ? String(v).trim() : "unknown";
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
        const ops = [];
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
                ops.push({ kind: "followup", bookingRef: bookingsRef.doc(doc.id) });
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
            const serviceTypeKey = serviceTypeId != null && String(serviceTypeId).trim() !== "" ? String(serviceTypeId).trim() : null;
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
            ops.push({
                kind: "archive",
                bookingRef: bookingsRef.doc(doc.id),
                clientKey,
                deterministicId,
                minimal,
                serviceTypeKey,
            });
        }
        const archiveClientKeys = new Set(ops.filter((o) => o.kind === "archive").map((o) => o.clientKey));
        const archiveByClient = new Map();
        for (const ck of archiveClientKeys) {
            const snap = await clientsRef.doc(ck).collection("archivedServiceTypes").get();
            archiveByClient.set(ck, snap.docs);
        }
        const stalePath = new Set();
        const staleRefs = [];
        for (const o of ops) {
            if (o.kind !== "archive" || !o.serviceTypeKey)
                continue;
            for (const ad of archiveByClient.get(o.clientKey) ?? []) {
                if (ad.id === o.deterministicId)
                    continue;
                if (getServiceTypeKey(ad.data()) === o.serviceTypeKey) {
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
            if (batchCount === 0)
                return;
            try {
                await batch.commit();
            }
            catch (e) {
                errors++;
                if (process.env.GCLOUD_PROJECT)
                    console.error("[expiredBookingsCleanup] batch commit error", { siteId, error: e });
            }
            batch = db.batch();
            batchCount = 0;
        };
        for (const ref of staleRefs) {
            if (batchCount >= FIRESTORE_BATCH_LIMIT)
                await flushBatch();
            batch.delete(ref);
            batchCount++;
        }
        for (const o of ops) {
            if (o.kind === "followup") {
                if (batchCount >= FIRESTORE_BATCH_LIMIT)
                    await flushBatch();
                batch.delete(o.bookingRef);
                batchCount++;
                deletedOnly++;
                continue;
            }
            if (batchCount + 2 > FIRESTORE_BATCH_LIMIT)
                await flushBatch();
            batch.delete(o.bookingRef);
            batch.set(clientsRef.doc(o.clientKey).collection("archivedServiceTypes").doc(o.deterministicId), o.minimal, { merge: false });
            batchCount += 2;
            archived++;
        }
        await flushBatch();
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
 * Delete waitlist rows whose preferred calendar day is strictly before "today" in the site timezone.
 */
async function deleteExpiredWaitlistEntriesForSite(siteId, siteTz) {
    const todayYmd = getTodayYMDInTimezone(siteTz);
    const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
    let total = 0;
    let q = col
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
        if (snapshot.docs.length < FIRESTORE_BATCH_LIMIT)
            break;
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
exports.waitlistPastDatesCleanup = functions.pubsub
    .schedule("20 2 * * *")
    .timeZone(TZ)
    .onRun(async () => {
    const sitesSnap = await db.collection("sites").get();
    for (const siteDoc of sitesSnap.docs) {
        const siteId = siteDoc.id;
        const siteData = siteDoc.data();
        const siteTz = siteData.config?.archiveRetention?.timezone ||
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
        }
        catch (e) {
            console.error("[waitlistPastDatesCleanup]", { siteId, error: e });
        }
    }
    return null;
});
/** Same TTL as app {@link WAITLIST_OFFER_TTL_MS} (2h). */
const WAITLIST_OFFER_TTL_MS = 2 * 60 * 60 * 1000;
const WAITLIST_SLOT_LOCKS = "waitlistSlotLocks";
function waitlistSlotLockDocIdForFn(dateYmd, timeHHmm, workerId) {
    const t = String(timeHHmm).replace(/:/g, "");
    const w = workerId && String(workerId).trim() ? String(workerId).trim().replace(/\//g, "_") : "_open";
    return `${dateYmd}_${t}_${w}`.slice(0, 700);
}
async function clearWaitlistSlotTimeLockForFn(siteId, lockId) {
    const ref = db.collection("sites").doc(siteId).collection(WAITLIST_SLOT_LOCKS).doc(lockId);
    await ref.set({
        lockedUntil: admin.firestore.Timestamp.fromMillis(0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
function offerPayloadToFreedSlot(offer) {
    const dateYmd = typeof offer.dateYmd === "string" ? offer.dateYmd.trim() : "";
    const timeHHmm = typeof offer.timeHHmm === "string" ? offer.timeHHmm.trim() : "";
    const serviceName = typeof offer.serviceName === "string" ? offer.serviceName : "";
    if (!dateYmd || !timeHHmm || !serviceName)
        return null;
    const primaryDurationMin = Math.max(1, Math.round(Number(offer.primaryDurationMin ?? offer.durationMin ?? 60)));
    const w = offer.workerId;
    const workerId = w != null && String(w).trim() !== "" ? String(w).trim() : null;
    const fw = offer.followUpWorkerId;
    const followUpWorkerId = fw != null && String(fw).trim() !== "" ? String(fw).trim() : null;
    return {
        dateYmd,
        timeHHmm,
        workerId,
        workerName: typeof offer.workerName === "string" ? offer.workerName : null,
        serviceTypeId: null,
        serviceId: null,
        serviceName,
        durationMin: primaryDurationMin,
        primaryDurationMin,
        waitMinutes: Math.max(0, Math.round(Number(offer.waitMinutes ?? 0))),
        followUpDurationMin: Math.max(0, Math.round(Number(offer.followUpDurationMin ?? 0))),
        followUpWorkerId,
        followUpWorkerName: typeof offer.followUpWorkerName === "string" ? offer.followUpWorkerName : null,
        followUpServiceName: offer.followUpServiceName != null && String(offer.followUpServiceName).trim() !== ""
            ? String(offer.followUpServiceName).trim()
            : null,
    };
}
async function expirePendingOfferDocAndRematch(siteId, docId, data) {
    const offer = data.offer;
    const ref = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(docId);
    await ref.update({
        status: "expired_offer",
        offer: admin.firestore.FieldValue.delete(),
        offerSentAt: admin.firestore.FieldValue.delete(),
        offerExpiresAt: admin.firestore.FieldValue.delete(),
        offerWebConfirmToken: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (!offer || typeof offer !== "object")
        return;
    const lockId = waitlistSlotLockDocIdForFn(String(offer.dateYmd ?? ""), String(offer.timeHHmm ?? ""), offer.workerId != null && String(offer.workerId).trim() ? String(offer.workerId).trim() : null);
    try {
        await clearWaitlistSlotTimeLockForFn(siteId, lockId);
    }
    catch (e) {
        console.error("[cleanupExpiredWaitlistOffers] clear_lock_failed", { siteId, docId, error: e });
    }
    const slot = offerPayloadToFreedSlot(offer);
    if (!slot) {
        console.warn("[cleanupExpiredWaitlistOffers] no_slot_from_offer", { siteId, docId });
        return;
    }
    const baseUrl = process.env.CALENO_APP_BASE_URL?.trim();
    const secret = process.env.CALENO_WAITLIST_INTERNAL_SECRET?.trim();
    if (!baseUrl || !secret) {
        console.error("[cleanupExpiredWaitlistOffers] missing CALENO_APP_BASE_URL or CALENO_WAITLIST_INTERNAL_SECRET; rematch skipped", { siteId, docId });
        return;
    }
    const url = `${baseUrl.replace(/\/$/, "")}/api/internal/waitlist/trigger-match-for-freed-slot`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-caleno-waitlist-secret": secret,
            },
            body: JSON.stringify({ siteId, slot, skipEntryIds: [docId] }),
        });
        if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.error("[cleanupExpiredWaitlistOffers] rematch_http_error", {
                siteId,
                docId,
                status: res.status,
                body: t.slice(0, 500),
            });
        }
    }
    catch (e) {
        console.error("[cleanupExpiredWaitlistOffers] rematch_fetch_failed", { siteId, docId, error: e });
    }
}
/**
 * Expire stale `pending_offer` rows (offerSentAt &gt; 2h ago), clear slot lock, call app to run waitlist match for that slot.
 * Requires deployed composite index on bookingWaitlistEntries: status + offerSentAt.
 * Rematch runs on Vercel (same secret as waitlistOnBookingDeleted).
 */
exports.cleanupExpiredWaitlistOffers = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("every 15 minutes")
    .timeZone(TZ)
    .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - WAITLIST_OFFER_TTL_MS);
    let totalExpired = 0;
    let fallbackSites = 0;
    const sitesSnap = await db.collection("sites").get();
    for (const siteDoc of sitesSnap.docs) {
        const siteId = siteDoc.id;
        const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
        let lastDoc = null;
        try {
            for (;;) {
                let q = col
                    .where("status", "==", "pending_offer")
                    .where("offerSentAt", "<", cutoff)
                    .orderBy("offerSentAt", "asc")
                    .limit(30);
                if (lastDoc)
                    q = q.startAfter(lastDoc);
                const snap = await q.get();
                if (snap.empty)
                    break;
                for (const doc of snap.docs) {
                    await expirePendingOfferDocAndRematch(siteId, doc.id, doc.data());
                    totalExpired++;
                }
                if (snap.size < 30)
                    break;
                lastDoc = snap.docs[snap.docs.length - 1];
            }
        }
        catch (e) {
            fallbackSites++;
            console.warn("[cleanupExpiredWaitlistOffers] compound_query_failed_using_fallback_scan", {
                siteId,
                error: e instanceof Error ? e.message : String(e),
            });
            try {
                const snap = await col.where("status", "==", "pending_offer").limit(250).get();
                const cutoffMs = cutoff.toMillis();
                const stale = snap.docs.filter((d) => {
                    const ts = d.data().offerSentAt;
                    const ms = ts && typeof ts.toMillis === "function" ? ts.toMillis() : null;
                    return ms != null && ms < cutoffMs;
                });
                for (const doc of stale) {
                    await expirePendingOfferDocAndRematch(siteId, doc.id, doc.data());
                    totalExpired++;
                }
            }
            catch (inner) {
                console.error("[cleanupExpiredWaitlistOffers] site_failed", { siteId, error: inner });
            }
        }
    }
    if (totalExpired > 0 || fallbackSites > 0) {
        console.log("[cleanupExpiredWaitlistOffers] done", { totalExpired, fallbackSites });
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
/**
 * Booking writes (public + admin): mirrors lib/liveStatsBookingDeltas — must stay in sync.
 */
exports.liveStatsOnBookingWrite = functions.firestore
    .document("sites/{siteId}/bookings/{bookingId}")
    .onWrite(async (change, context) => {
    const siteId = context.params.siteId;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    try {
        if (!before && after) {
            const pack = (0, liveBookingAnalytics_1.liveStatsDeltaForBookingCreated)(after);
            if (pack)
                await (0, liveStatsScorekeeper_1.updateLiveStats)(db, siteId, pack.ymd, pack.delta, pack.trafficSourceDeltas);
            return;
        }
        if (before && after) {
            const wasCancelled = (0, liveBookingAnalytics_1.isDocCancelled)(before);
            const nowCancelled = (0, liveBookingAnalytics_1.isDocCancelled)(after);
            if (!wasCancelled && nowCancelled) {
                const pack = (0, liveBookingAnalytics_1.liveStatsDeltaForActiveCancellation)(before);
                if (pack) {
                    await (0, liveStatsScorekeeper_1.updateLiveStats)(db, siteId, pack.ymd, pack.delta, pack.trafficSourceDeltas);
                }
            }
        }
    }
    catch (e) {
        console.error("[liveStatsOnBookingWrite]", { siteId, error: e });
    }
});
/** New client profile (phone doc created). */
exports.liveStatsOnClientCreate = functions.firestore
    .document("sites/{siteId}/clients/{clientId}")
    .onCreate(async (snap, context) => {
    const siteId = context.params.siteId;
    const data = snap.data();
    let ymd;
    const ca = data.createdAt;
    if (ca && typeof ca.toDate === "function") {
        try {
            ymd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(ca.toDate(), TZ);
        }
        catch {
            ymd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(new Date(), TZ);
        }
    }
    else {
        ymd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(new Date(), TZ);
    }
    try {
        await (0, liveStatsScorekeeper_1.updateLiveStats)(db, siteId, ymd, { newClients: 1 });
    }
    catch (e) {
        console.error("[liveStatsOnClientCreate]", { siteId, error: e });
    }
});
/**
 * Master auditor: each outbound WhatsApp receipt in whatsapp_logs bumps dashboard WhatsApp counts once.
 * Uses the same day buckets + totals as booking/client live stats.
 */
exports.auditWhatsAppUsage = functions.firestore
    .document("sites/{siteId}/whatsapp_logs/{logId}")
    .onCreate(async (snap, context) => {
    const siteId = context.params.siteId;
    const data = snap.data();
    const ts = data?.createdAt;
    let ymd;
    if (ts && typeof ts.toDate === "function") {
        try {
            ymd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(ts.toDate(), TZ);
        }
        catch {
            ymd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(new Date(), TZ);
        }
    }
    else {
        ymd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(new Date(), TZ);
    }
    try {
        await (0, liveStatsScorekeeper_1.updateLiveStats)(db, siteId, ymd, { whatsappCount: 1 });
        console.log("[auditWhatsAppUsage]", { siteId, logId: context.params.logId, ymd, type: data?.type });
    }
    catch (e) {
        console.error("[auditWhatsAppUsage]", { siteId, error: e });
    }
});
/**
 * Backup waitlist match when a booking doc is deleted (e.g. console delete). In-app cascade already notifies;
 * slot lock prevents duplicate offers when both run. Requires CALENO_APP_BASE_URL + CALENO_WAITLIST_INTERNAL_SECRET.
 */
exports.waitlistOnBookingDeleted = functions.firestore
    .document("sites/{siteId}/bookings/{bookingId}")
    .onDelete(async (snap, context) => {
    const baseUrl = process.env.CALENO_APP_BASE_URL?.trim();
    const secret = process.env.CALENO_WAITLIST_INTERNAL_SECRET?.trim();
    if (!baseUrl || !secret)
        return;
    const data = snap.data();
    if (!data)
        return;
    if (data.phase === 2)
        return;
    const pid = data.parentBookingId;
    if (pid != null && String(pid).trim() !== "")
        return;
    const siteId = context.params.siteId;
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
    }
    catch (e) {
        console.error("[waitlistOnBookingDeleted]", { siteId, error: e });
    }
});
