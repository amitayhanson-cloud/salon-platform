/**
 * Increment-on-action live dashboard stats for sites/{siteId}/analytics/dashboardCurrent.
 * Uses FieldValue.increment; totals mirror calendar month only (same rules as legacy recompute).
 */

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { StoredMetrics } from "@/lib/dashboardAnalyticsStoredMetrics";
import { getDateYMDInTimezone, zonedDayRangeEpochMs } from "@/lib/expiredCleanupUtils";

const IL_TZ = "Asia/Jerusalem";

export type LiveStatsDelta = Partial<{
  revenue: number;
  bookings: number;
  cancellations: number;
  whatsappCount: number;
  newClients: number;
  bookedMinutes: number;
  trafficAttributedBookings: number;
}>;

/** One booking-related adjustment (create/cancel/undo) for batching or CF. */
export type LiveStatsBookingEffect = {
  ymd: string;
  delta: LiveStatsDelta;
  /** Sanitized keys only (see {@link mergeLiveStatsEffectsToPatch}). */
  trafficSourceDeltas?: Record<string, number>;
};

const INCREMENT_KEYS = new Set([
  "revenue",
  "bookings",
  "cancellations",
  "whatsappCount",
  "newClients",
  "bookedMinutes",
  "trafficAttributedBookings",
]);

export function zeroStoredMetrics(): StoredMetrics {
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

function dashboardCurrentRef(db: Firestore, siteId: string) {
  return db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");
}

function monthKeyFromWallClock(now: Date): string {
  return getDateYMDInTimezone(now, IL_TZ).slice(0, 7);
}

function parseMonthKey(key: string): { year: number; month1: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month1: m };
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function enumerateYmdInMonth(year: number, month1: number): string[] {
  const dim = daysInMonth(year, month1);
  return Array.from(
    { length: dim },
    (_, i) => `${year}-${String(month1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
  );
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d + deltaDays);
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function weekdayShortEnUsForIsraelYmd(ymd: string): string {
  const { start } = zonedDayRangeEpochMs(ymd, IL_TZ);
  return new Date(start + 12 * 3600_000).toLocaleDateString("en-US", {
    timeZone: IL_TZ,
    weekday: "short",
  });
}

function sundayYmdOfIsraelWeekContaining(ymd: string): string {
  let cur = ymd;
  for (let i = 0; i < 7; i++) {
    if (weekdayShortEnUsForIsraelYmd(cur) === "Sun") return cur;
    cur = addCalendarDaysYmd(cur, -1);
  }
  return ymd;
}

function weekYmdsSundayToSaturdayContaining(ymd: string): string[] {
  const sun = sundayYmdOfIsraelWeekContaining(ymd);
  return Array.from({ length: 7 }, (_, i) => addCalendarDaysYmd(sun, i));
}

function sortedUniqueYmds(ymds: string[]): string[] {
  return Array.from(new Set(ymds)).sort();
}

function unionYmdsForDashboardMonth(monthKey: string, now: Date): string[] {
  const { year, month1 } = parseMonthKey(monthKey);
  const ymds = enumerateYmdInMonth(year, month1);
  const todayYmd = getDateYMDInTimezone(now, IL_TZ);
  const weekYmds = weekYmdsSundayToSaturdayContaining(todayYmd);
  return sortedUniqueYmds([...ymds, ...weekYmds]);
}

function sumTotalsForCalendarMonth(
  days: Record<string, StoredMetrics | undefined> | undefined,
  monthKey: string
): StoredMetrics {
  const { year, month1 } = parseMonthKey(monthKey);
  const ymds = enumerateYmdInMonth(year, month1);
  const t = zeroStoredMetrics();
  for (const ymd of ymds) {
    const m = days?.[ymd];
    if (!m) continue;
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

function carryDaysForNewMonth(
  prevDays: Record<string, StoredMetrics> | undefined,
  unionYmds: string[]
): Record<string, StoredMetrics> {
  const out: Record<string, StoredMetrics> = {};
  for (const ymd of unionYmds) {
    const prev = prevDays?.[ymd];
    if (prev && typeof prev === "object") {
      out[ymd] = { ...zeroStoredMetrics(), ...prev };
    }
  }
  return out;
}

/** Non-blocking: log errors only. */
export function fireAndForgetLiveStats(run: () => Promise<void>): void {
  void run().catch((e) => console.error("[liveStatsScorekeeper]", e));
}

/**
 * Merge multiple booking effects into one Firestore patch (FieldValue.increment only).
 * Traffic keys must already be sanitized (e.g. instagram, google_ads).
 */
export function mergeLiveStatsEffectsToPatch(
  docMonth: string,
  effects: LiveStatsBookingEffect[]
): Record<string, unknown> | null {
  const dayAgg = new Map<string, number>();
  const totalsAgg = new Map<string, number>();
  const trafficAgg = new Map<string, number>();

  for (const eff of effects) {
    const applyTotals = eff.ymd.slice(0, 7) === docMonth;
    for (const [k, v] of Object.entries(eff.delta)) {
      if (!INCREMENT_KEYS.has(k) || v == null) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n === 0) continue;
      const dk = `${eff.ymd}\0${k}`;
      dayAgg.set(dk, (dayAgg.get(dk) ?? 0) + n);
      if (applyTotals) totalsAgg.set(k, (totalsAgg.get(k) ?? 0) + n);
    }
    if (applyTotals && eff.trafficSourceDeltas) {
      for (const [tk, tv] of Object.entries(eff.trafficSourceDeltas)) {
        if (!tk || tv == null) continue;
        const n = Number(tv);
        if (!Number.isFinite(n) || n === 0) continue;
        trafficAgg.set(tk, (trafficAgg.get(tk) ?? 0) + n);
      }
    }
  }

  if (dayAgg.size === 0 && totalsAgg.size === 0 && trafficAgg.size === 0) return null;

  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const [dk, sum] of dayAgg) {
    const idx = dk.indexOf("\0");
    const ymd = dk.slice(0, idx);
    const mk = dk.slice(idx + 1);
    patch[`days.${ymd}.${mk}`] = FieldValue.increment(sum);
  }
  for (const [k, sum] of totalsAgg) {
    patch[`totals.${k}`] = FieldValue.increment(sum);
  }
  for (const [k, sum] of trafficAgg) {
    patch[`trafficSources.${k}`] = FieldValue.increment(sum);
  }
  return patch;
}

/** Rollover/seed, then build one patch for atomic batch.commit with booking writes. */
export async function prepareDashboardBatchIncrement(
  db: Firestore,
  siteId: string,
  effects: LiveStatsBookingEffect[]
): Promise<Record<string, unknown> | null> {
  if (effects.length === 0) return null;
  await rolloverDashboardMonthIfNeeded(db, siteId);
  await seedDashboardCurrentIfMissing(db, siteId);
  const ref = dashboardCurrentRef(db, siteId);
  const snap = await ref.get();
  const docMonth =
    snap.exists && typeof (snap.data() as { monthKey?: string }).monthKey === "string"
      ? (snap.data() as { monthKey: string }).monthKey
      : monthKeyFromWallClock(new Date());
  return mergeLiveStatsEffectsToPatch(docMonth, effects);
}

export async function seedDashboardCurrentIfMissing(db: Firestore, siteId: string, now = new Date()): Promise<void> {
  const ref = dashboardCurrentRef(db, siteId);
  const snap = await ref.get();
  if (snap.exists) return;
  const monthKey = monthKeyFromWallClock(now);
  const siteSnap = await db.collection("sites").doc(siteId).get();
  const site = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
  await ref.set(
    {
      monthKey,
      days: {},
      totals: zeroStoredMetrics(),
      trafficSources: {},
      updatedAt: Timestamp.now(),
      ownerUid: site?.ownerUid,
      ownerUserId: site?.ownerUserId,
    },
    { merge: true }
  );
}

/**
 * When Israel calendar month changes, archive prior totals to monthly/months/{monthKey},
 * then reset dashboardCurrent with carried-over day buckets that intersect the new month’s grid.
 */
export async function rolloverDashboardMonthIfNeeded(db: Firestore, siteId: string, now = new Date()): Promise<void> {
  const ref = dashboardCurrentRef(db, siteId);
  const snap = await ref.get();
  const needMonthKey = monthKeyFromWallClock(now);

  if (!snap.exists) {
    await seedDashboardCurrentIfMissing(db, siteId, now);
    return;
  }

  const existing = snap.data() as {
    monthKey?: string;
    totals?: StoredMetrics;
    days?: Record<string, StoredMetrics>;
    ownerUid?: string;
    ownerUserId?: string;
  };
  const prevMonthKey = existing.monthKey;
  if (!prevMonthKey || prevMonthKey === needMonthKey) return;

  if (existing.totals) {
    await db
      .collection("sites")
      .doc(siteId)
      .collection("analytics")
      .doc("monthly")
      .collection("months")
      .doc(prevMonthKey)
      .set(
        {
          monthKey: prevMonthKey,
          totals: existing.totals,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
  }

  const union = unionYmdsForDashboardMonth(needMonthKey, now);
  const newDays = carryDaysForNewMonth(existing.days, union);
  const totals = sumTotalsForCalendarMonth(newDays, needMonthKey);

  const siteSnap = await db.collection("sites").doc(siteId).get();
  const site = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;

  await ref.set({
    monthKey: needMonthKey,
    days: newDays,
    totals,
    trafficSources: {},
    updatedAt: Timestamp.now(),
    ownerUid: site?.ownerUid ?? existing.ownerUid,
    ownerUserId: site?.ownerUserId ?? existing.ownerUserId,
  });
}

export async function updateLiveStats(
  db: Firestore,
  siteId: string,
  dateYmd: string,
  metrics: LiveStatsDelta,
  trafficSourceDeltas?: Record<string, number>
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    console.warn("[updateLiveStats] invalid dateYmd", dateYmd);
    return;
  }

  await rolloverDashboardMonthIfNeeded(db, siteId);
  await seedDashboardCurrentIfMissing(db, siteId);

  const ref = dashboardCurrentRef(db, siteId);
  const pairs: [string, number][] = [];
  for (const [k, v] of Object.entries(metrics)) {
    if (!INCREMENT_KEYS.has(k) || v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) continue;
    pairs.push([k, n]);
  }
  const trafficPairs: [string, number][] = [];
  if (trafficSourceDeltas) {
    for (const [tk, tv] of Object.entries(trafficSourceDeltas)) {
      if (!tk || tv == null) continue;
      const n = Number(tv);
      if (!Number.isFinite(n) || n === 0) continue;
      trafficPairs.push([tk, n]);
    }
  }
  if (pairs.length === 0 && trafficPairs.length === 0) return;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const wallMonth = monthKeyFromWallClock(new Date());
    const docMonth =
      snap.exists && typeof (snap.data() as { monthKey?: string }).monthKey === "string"
        ? (snap.data() as { monthKey: string }).monthKey
        : wallMonth;
    const dateMonth = dateYmd.slice(0, 7);
    const applyToTotals = dateMonth === docMonth;

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const [key, n] of pairs) {
      patch[`days.${dateYmd}.${key}`] = FieldValue.increment(n);
      if (applyToTotals) {
        patch[`totals.${key}`] = FieldValue.increment(n);
      }
    }
    if (applyToTotals) {
      for (const [tk, n] of trafficPairs) {
        patch[`trafficSources.${tk}`] = FieldValue.increment(n);
      }
    }

    if (!snap.exists) {
      const siteSnap = await tx.get(db.collection("sites").doc(siteId));
      const site = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
      tx.set(
        ref,
        {
          monthKey: docMonth,
          days: {},
          totals: zeroStoredMetrics(),
          trafficSources: {},
          ownerUid: site?.ownerUid,
          ownerUserId: site?.ownerUserId,
          ...patch,
        },
        { merge: true }
      );
      return;
    }

    tx.update(ref, patch);
  });
}

/** Reset live scoreboard to zeros for launch / DB cleanup (all increment fields + empty days). */
export async function resetDashboardCurrentForSite(db: Firestore, siteId: string, now = new Date()): Promise<void> {
  const ref = dashboardCurrentRef(db, siteId);
  const monthKey = monthKeyFromWallClock(now);
  const siteSnap = await db.collection("sites").doc(siteId).get();
  const site = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
  await ref.set({
    monthKey,
    days: {},
    totals: zeroStoredMetrics(),
    trafficSources: {},
    updatedAt: Timestamp.now(),
    ownerUid: site?.ownerUid,
    ownerUserId: site?.ownerUserId,
  });
}
