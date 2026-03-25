"use strict";
/**
 * Copy of lib/liveStatsScorekeeper for Firebase Functions (no monorepo path aliases).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeLiveStatsEffectsToPatch = mergeLiveStatsEffectsToPatch;
exports.prepareDashboardBatchIncrement = prepareDashboardBatchIncrement;
exports.seedDashboardCurrentIfMissing = seedDashboardCurrentIfMissing;
exports.rolloverDashboardMonthIfNeeded = rolloverDashboardMonthIfNeeded;
exports.updateLiveStats = updateLiveStats;
const firestore_1 = require("firebase-admin/firestore");
const expiredCleanupUtilsForFunctions_1 = require("./expiredCleanupUtilsForFunctions");
const IL_TZ = "Asia/Jerusalem";
const INCREMENT_KEYS = new Set([
    "revenue",
    "bookings",
    "cancellations",
    "whatsappCount",
    "newClients",
    "bookedMinutes",
    "trafficAttributedBookings",
]);
function zeroStoredMetrics() {
    return {
        revenue: 0,
        bookings: 0,
        whatsappCount: 0,
        clientsCumulative: 0,
        newClients: 0,
        cancellations: 0,
        utilizationPercent: 0,
        trafficAttributedBookings: 0,
        bookedMinutes: 0,
        capacityMinutes: 0,
    };
}
function dashboardCurrentRef(db, siteId) {
    return db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");
}
function monthKeyFromWallClock(now) {
    return (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(now, IL_TZ).slice(0, 7);
}
function parseMonthKey(key) {
    const [y, m] = key.split("-").map(Number);
    return { year: y, month1: m };
}
function daysInMonth(year, month1) {
    return new Date(year, month1, 0).getDate();
}
function enumerateYmdInMonth(year, month1) {
    const dim = daysInMonth(year, month1);
    return Array.from({ length: dim }, (_, i) => `${year}-${String(month1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}
function addCalendarDaysYmd(ymd, deltaDays) {
    const [y, m, d] = ymd.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d + deltaDays);
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function weekdayShortEnUsForIsraelYmd(ymd) {
    const { start } = (0, expiredCleanupUtilsForFunctions_1.zonedDayRangeEpochMs)(ymd, IL_TZ);
    return new Date(start + 12 * 3600_000).toLocaleDateString("en-US", {
        timeZone: IL_TZ,
        weekday: "short",
    });
}
function sundayYmdOfIsraelWeekContaining(ymd) {
    let cur = ymd;
    for (let i = 0; i < 7; i++) {
        if (weekdayShortEnUsForIsraelYmd(cur) === "Sun")
            return cur;
        cur = addCalendarDaysYmd(cur, -1);
    }
    return ymd;
}
function weekYmdsSundayToSaturdayContaining(ymd) {
    const sun = sundayYmdOfIsraelWeekContaining(ymd);
    return Array.from({ length: 7 }, (_, i) => addCalendarDaysYmd(sun, i));
}
function sortedUniqueYmds(ymds) {
    return Array.from(new Set(ymds)).sort();
}
function unionYmdsForDashboardMonth(monthKey, now) {
    const { year, month1 } = parseMonthKey(monthKey);
    const ymds = enumerateYmdInMonth(year, month1);
    const todayYmd = (0, expiredCleanupUtilsForFunctions_1.getDateYMDInTimezone)(now, IL_TZ);
    const weekYmds = weekYmdsSundayToSaturdayContaining(todayYmd);
    return sortedUniqueYmds([...ymds, ...weekYmds]);
}
function sumTotalsForCalendarMonth(days, monthKey) {
    const { year, month1 } = parseMonthKey(monthKey);
    const ymds = enumerateYmdInMonth(year, month1);
    const t = zeroStoredMetrics();
    for (const ymd of ymds) {
        const m = days?.[ymd];
        if (!m)
            continue;
        t.revenue += m.revenue ?? 0;
        t.bookings += m.bookings ?? 0;
        t.whatsappCount += m.whatsappCount ?? 0;
        t.newClients += m.newClients ?? 0;
        t.cancellations += m.cancellations ?? 0;
        t.trafficAttributedBookings += m.trafficAttributedBookings ?? 0;
        t.bookedMinutes += m.bookedMinutes ?? 0;
        t.capacityMinutes += m.capacityMinutes ?? 0;
    }
    t.utilizationPercent =
        t.capacityMinutes > 0
            ? Math.min(100, Math.round((t.bookedMinutes / t.capacityMinutes) * 1000) / 10)
            : 0;
    return t;
}
function carryDaysForNewMonth(prevDays, unionYmds) {
    const out = {};
    for (const ymd of unionYmds) {
        const prev = prevDays?.[ymd];
        if (prev && typeof prev === "object") {
            out[ymd] = { ...zeroStoredMetrics(), ...prev };
        }
    }
    return out;
}
function mergeLiveStatsEffectsToPatch(docMonth, effects) {
    const dayAgg = new Map();
    const totalsAgg = new Map();
    const trafficAgg = new Map();
    for (const eff of effects) {
        const applyTotals = eff.ymd.slice(0, 7) === docMonth;
        for (const [k, v] of Object.entries(eff.delta)) {
            if (!INCREMENT_KEYS.has(k) || v == null)
                continue;
            const n = Number(v);
            if (!Number.isFinite(n) || n === 0)
                continue;
            const dk = `${eff.ymd}\0${k}`;
            dayAgg.set(dk, (dayAgg.get(dk) ?? 0) + n);
            if (applyTotals)
                totalsAgg.set(k, (totalsAgg.get(k) ?? 0) + n);
        }
        if (applyTotals && eff.trafficSourceDeltas) {
            for (const [tk, tv] of Object.entries(eff.trafficSourceDeltas)) {
                if (!tk || tv == null)
                    continue;
                const n = Number(tv);
                if (!Number.isFinite(n) || n === 0)
                    continue;
                trafficAgg.set(tk, (trafficAgg.get(tk) ?? 0) + n);
            }
        }
    }
    if (dayAgg.size === 0 && totalsAgg.size === 0 && trafficAgg.size === 0)
        return null;
    const patch = {
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    for (const [dk, sum] of dayAgg) {
        const idx = dk.indexOf("\0");
        const ymd = dk.slice(0, idx);
        const mk = dk.slice(idx + 1);
        patch[`days.${ymd}.${mk}`] = firestore_1.FieldValue.increment(sum);
    }
    for (const [k, sum] of totalsAgg) {
        patch[`totals.${k}`] = firestore_1.FieldValue.increment(sum);
    }
    for (const [k, sum] of trafficAgg) {
        patch[`trafficSources.${k}`] = firestore_1.FieldValue.increment(sum);
    }
    return patch;
}
async function prepareDashboardBatchIncrement(db, siteId, effects) {
    if (effects.length === 0)
        return null;
    await rolloverDashboardMonthIfNeeded(db, siteId);
    await seedDashboardCurrentIfMissing(db, siteId);
    const ref = dashboardCurrentRef(db, siteId);
    const snap = await ref.get();
    const docMonth = snap.exists && typeof snap.data().monthKey === "string"
        ? snap.data().monthKey
        : monthKeyFromWallClock(new Date());
    return mergeLiveStatsEffectsToPatch(docMonth, effects);
}
async function seedDashboardCurrentIfMissing(db, siteId, now = new Date()) {
    const ref = dashboardCurrentRef(db, siteId);
    const snap = await ref.get();
    if (snap.exists)
        return;
    const monthKey = monthKeyFromWallClock(now);
    const siteSnap = await db.collection("sites").doc(siteId).get();
    const site = siteSnap.data();
    await ref.set({
        monthKey,
        days: {},
        totals: zeroStoredMetrics(),
        trafficSources: {},
        updatedAt: firestore_1.Timestamp.now(),
        ownerUid: site?.ownerUid,
        ownerUserId: site?.ownerUserId,
    }, { merge: true });
}
async function rolloverDashboardMonthIfNeeded(db, siteId, now = new Date()) {
    const ref = dashboardCurrentRef(db, siteId);
    const snap = await ref.get();
    const needMonthKey = monthKeyFromWallClock(now);
    if (!snap.exists) {
        await seedDashboardCurrentIfMissing(db, siteId, now);
        return;
    }
    const existing = snap.data();
    const prevMonthKey = existing.monthKey;
    if (!prevMonthKey || prevMonthKey === needMonthKey)
        return;
    if (existing.totals) {
        await db
            .collection("sites")
            .doc(siteId)
            .collection("analytics")
            .doc("monthly")
            .collection("months")
            .doc(prevMonthKey)
            .set({
            monthKey: prevMonthKey,
            totals: existing.totals,
            updatedAt: firestore_1.Timestamp.now(),
        }, { merge: true });
    }
    const union = unionYmdsForDashboardMonth(needMonthKey, now);
    const newDays = carryDaysForNewMonth(existing.days, union);
    const totals = sumTotalsForCalendarMonth(newDays, needMonthKey);
    const siteSnap = await db.collection("sites").doc(siteId).get();
    const site = siteSnap.data();
    await ref.set({
        monthKey: needMonthKey,
        days: newDays,
        totals,
        trafficSources: {},
        updatedAt: firestore_1.Timestamp.now(),
        ownerUid: site?.ownerUid ?? existing.ownerUid,
        ownerUserId: site?.ownerUserId ?? existing.ownerUserId,
    });
}
async function updateLiveStats(db, siteId, dateYmd, metrics, trafficSourceDeltas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
        console.warn("[updateLiveStats] invalid dateYmd", dateYmd);
        return;
    }
    await rolloverDashboardMonthIfNeeded(db, siteId);
    await seedDashboardCurrentIfMissing(db, siteId);
    const ref = dashboardCurrentRef(db, siteId);
    const pairs = [];
    for (const [k, v] of Object.entries(metrics)) {
        if (!INCREMENT_KEYS.has(k) || v == null)
            continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n === 0)
            continue;
        pairs.push([k, n]);
    }
    const trafficPairs = [];
    if (trafficSourceDeltas) {
        for (const [tk, tv] of Object.entries(trafficSourceDeltas)) {
            if (!tk || tv == null)
                continue;
            const n = Number(tv);
            if (!Number.isFinite(n) || n === 0)
                continue;
            trafficPairs.push([tk, n]);
        }
    }
    if (pairs.length === 0 && trafficPairs.length === 0)
        return;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const wallMonth = monthKeyFromWallClock(new Date());
        const docMonth = snap.exists && typeof snap.data().monthKey === "string"
            ? snap.data().monthKey
            : wallMonth;
        const dateMonth = dateYmd.slice(0, 7);
        const applyToTotals = dateMonth === docMonth;
        const patch = {
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        for (const [key, n] of pairs) {
            patch[`days.${dateYmd}.${key}`] = firestore_1.FieldValue.increment(n);
            if (applyToTotals) {
                patch[`totals.${key}`] = firestore_1.FieldValue.increment(n);
            }
        }
        if (applyToTotals) {
            for (const [tk, n] of trafficPairs) {
                patch[`trafficSources.${tk}`] = firestore_1.FieldValue.increment(n);
            }
        }
        if (!snap.exists) {
            const siteSnap = await tx.get(db.collection("sites").doc(siteId));
            const site = siteSnap.data();
            tx.set(ref, {
                monthKey: docMonth,
                days: {},
                totals: zeroStoredMetrics(),
                trafficSources: {},
                ownerUid: site?.ownerUid,
                ownerUserId: site?.ownerUserId,
                ...patch,
            }, { merge: true });
            return;
        }
        tx.update(ref, patch);
    });
}
