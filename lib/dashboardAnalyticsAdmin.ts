import { Timestamp, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { isDocCancelled } from "@/lib/cancelledBookingShared";
import { isFollowUpBooking } from "@/lib/normalizeBooking";
import { isClosedDate } from "@/lib/closedDates";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import { getDateYMDInTimezone, zonedDayRangeEpochMs } from "@/lib/expiredCleanupUtils";
import type { StoredMetrics } from "@/lib/dashboardAnalyticsStoredMetrics";
import type { DeepArchiveDayAdjustments } from "@/lib/dashboardDeepArchiveMergeAdmin";
import { readDeepArchiveMergeDaysAdmin, sumDeepAdjustmentsForMonthKey } from "@/lib/dashboardDeepArchiveMergeAdmin";
import { analyticsRangeToStartAtBounds, bookingDayYmdIsrael } from "@/lib/bookingDayKey";

const IL_TZ = "Asia/Jerusalem";

export type { StoredMetrics } from "@/lib/dashboardAnalyticsStoredMetrics";

export type CurrentMonthDoc = {
  monthKey: string;
  days: Record<string, StoredMetrics>;
  totals: StoredMetrics;
  updatedAt: Timestamp;
  /** Copied from sites/{siteId} on write so chart API can authorize with one document read */
  ownerUid?: string;
  ownerUserId?: string;
};

export type DashboardMetricSlice = {
  labels: string[];
  /** Optional per-point title (e.g. Hebrew date above chart); x-axis uses {@link labels}. */
  titleLabels?: string[];
  revenue: ChartMetricPoint[];
  bookings: ChartMetricPoint[];
  /** Week/month only: stacked bar — confirmed & past days (Israel) vs future calendar days. */
  bookingsPast?: ChartMetricPoint[];
  bookingsFuture?: ChartMetricPoint[];
  whatsappCount: ChartMetricPoint[];
  clientsCumulative: ChartMetricPoint[];
  newClients: ChartMetricPoint[];
  cancellations: ChartMetricPoint[];
  utilizationPercent: ChartMetricPoint[];
  trafficAttributedBookings: ChartMetricPoint[];
};

export type DashboardChartSeriesBundleAdmin = {
  week: DashboardMetricSlice;
  month: DashboardMetricSlice;
  year: DashboardMetricSlice;
  fetchedAt: string;
};

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function enumerateYmdInMonth(year: number, month1: number): string[] {
  const dim = daysInMonth(year, month1);
  return Array.from({ length: dim }, (_, i) => `${year}-${String(month1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

function parseMonthKey(key: string): { year: number; month1: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month1: m };
}

/** `monthKey` = YYYY-MM in Israel for `now`. */
function monthKeyIsraelFromDate(now: Date): string {
  return getDateYMDInTimezone(now, IL_TZ).slice(0, 7);
}

/** Pure calendar YYYY-MM-DD +/- days (UTC arithmetic on civil date). */
function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d + deltaDays);
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function sortedUniqueYmds(ymds: string[]): string[] {
  return Array.from(new Set(ymds)).sort();
}

/** Weekday in en-US short form ("Sun"…"Sat") for the Israel civil date `ymd`. */
function weekdayShortEnUsForIsraelYmd(ymd: string): string {
  const { start } = zonedDayRangeEpochMs(ymd, IL_TZ);
  return new Date(start + 12 * 3600_000).toLocaleDateString("en-US", {
    timeZone: IL_TZ,
    weekday: "short",
  });
}

/** Sunday (YYYY-MM-DD, Israel calendar) of the week that contains `ymd`. */
function sundayYmdOfIsraelWeekContaining(ymd: string): string {
  let cur = ymd;
  for (let i = 0; i < 7; i++) {
    if (weekdayShortEnUsForIsraelYmd(cur) === "Sun") return cur;
    cur = addCalendarDaysYmd(cur, -1);
  }
  return ymd;
}

/** Seven days: Sunday → Saturday (Israel), week containing `ymd`. */
function weekYmdsSundayToSaturdayContaining(ymd: string): string[] {
  const sun = sundayYmdOfIsraelWeekContaining(ymd);
  return Array.from({ length: 7 }, (_, i) => addCalendarDaysYmd(sun, i));
}

/** Bottom x-axis for week view: English weekday (Sunday … Saturday) in Israel. */
function formatWeekAxisEnglishWeekdayLong(ymd: string): string {
  const { start } = zonedDayRangeEpochMs(ymd, IL_TZ);
  const mid = start + 12 * 3600_000;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: IL_TZ,
    weekday: "long",
  }).format(new Date(mid));
}

/** Title row above chart (Hebrew date + weekday) for week view. */
function formatWeekAxisLabelIsrael(ymd: string): string {
  const { start } = zonedDayRangeEpochMs(ymd, IL_TZ);
  const mid = start + 12 * 3600_000;
  const parts = new Intl.DateTimeFormat("he-IL", {
    timeZone: IL_TZ,
    weekday: "long",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date(mid));
  let weekday = "";
  let day = "";
  let month = "";
  for (const p of parts) {
    if (p.type === "weekday") weekday = p.value;
    if (p.type === "day") day = p.value;
    if (p.type === "month") month = p.value;
  }
  if (!day) day = ymd.slice(8).replace(/^0/, "") || ymd.slice(8);
  if (!month) month = String(Number(ymd.slice(5, 7)));
  if (!weekday) weekday = "יום";
  return `${weekday} · ${day}.${month}`;
}

/** One chart value: `null` = no bar (e.g. future day). */
export type ChartMetricPoint = number | null;

function initMetrics(): StoredMetrics {
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

/** Deep archive merge (archivedServiceTypes-only rows) folded into live recompute; primary counts stay bookings collection. */
function applyDeepMergeToDays(
  days: Record<string, StoredMetrics>,
  unionYmds: string[],
  mergeDays: Record<string, DeepArchiveDayAdjustments> | null | undefined
): void {
  if (!mergeDays) return;
  for (const ymd of unionYmds) {
    const add = mergeDays[ymd];
    if (!add) continue;
    const m = days[ymd];
    if (!m) continue;
    m.bookings += add.bookings;
    m.bookedMinutes += add.bookedMinutes;
    m.revenue += add.revenue;
    m.trafficAttributedBookings += add.trafficAttributedBookings;
  }
}

function initDeepArchiveZeros(): DeepArchiveDayAdjustments {
  return { bookings: 0, bookedMinutes: 0, revenue: 0, trafficAttributedBookings: 0 };
}

/** `dateISO`, `date`, and `startAt` (Israel day bounds), de-duped by doc id — matches calendar/listing behavior. */
async function fetchBookingDocsForAnalyticsRangeAdmin(
  db: Firestore,
  siteId: string,
  rangeStartYmd: string,
  rangeEndYmd: string
): Promise<QueryDocumentSnapshot[]> {
  const col = db.collection("sites").doc(siteId).collection("bookings");
  const { startMs, endExclusiveMs } = analyticsRangeToStartAtBounds(rangeStartYmd, rangeEndYmd);
  const tsLow = Timestamp.fromMillis(startMs);
  const tsHigh = Timestamp.fromMillis(endExclusiveMs);

  const [isoSnap, dateSnap, startAtSnapResult] = await Promise.all([
    col.where("dateISO", ">=", rangeStartYmd).where("dateISO", "<=", rangeEndYmd).get(),
    col.where("date", ">=", rangeStartYmd).where("date", "<=", rangeEndYmd).get(),
    (async () => {
      try {
        return await col.where("startAt", ">=", tsLow).where("startAt", "<", tsHigh).get();
      } catch (e) {
        console.warn("[fetchBookingDocsForAnalyticsRangeAdmin] startAt range query failed", e);
        return null;
      }
    })(),
  ]);

  const seen = new Set<string>();
  const out: QueryDocumentSnapshot[] = [];
  const snaps = startAtSnapResult ? [isoSnap, dateSnap, startAtSnapResult] : [isoSnap, dateSnap];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        out.push(doc);
      }
    }
  }
  return out;
}

/**
 * Broken client writes (e.g. `sanitizeForFirestore` once stripped FieldValue): stored as plain map, not a real time.
 * See `sanitizeForFirestore` — `serverTimestamp()` must stay a {@link FieldValue}.
 */
function isBrokenServerTimestampMap(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object") return false;
  const m = (raw as { _methodName?: unknown })._methodName;
  return m === "serverTimestamp" || m === "ServerTimestamp";
}

/** Parses a real Firestore time; `null` if missing or unparseable (including broken sentinel). */
function tryParseFirestoreTime(raw: unknown): number | null {
  if (raw == null || raw === undefined) return null;
  if (isBrokenServerTimestampMap(raw)) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw instanceof Timestamp) {
    const n = raw.toMillis();
    return Number.isFinite(n) ? n : null;
  }
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "string" && raw.trim()) {
    const t = Date.parse(raw.trim());
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { toMillis?: () => number; toDate?: () => Date; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
    if (typeof o.toMillis === "function") {
      const n = o.toMillis();
      return Number.isFinite(n) ? n : null;
    }
    if (typeof o.toDate === "function") {
      const t = o.toDate().getTime();
      return Number.isFinite(t) ? t : null;
    }
    const sec = typeof o.seconds === "number" ? o.seconds : typeof o._seconds === "number" ? o._seconds : undefined;
    if (sec !== undefined && Number.isFinite(sec)) {
      const nano = (typeof o.nanoseconds === "number" ? o.nanoseconds : o._nanoseconds ?? 0) / 1e6;
      return sec * 1000 + nano;
    }
  }
  return null;
}

/**
 * Epoch ms for client creation for analytics.
 * `updatedAt` helps when `createdAt` is the broken serverTimestamp map (fall back), then `Date.now()` as last resort.
 */
function parseClientCreatedEpochMs(raw: unknown, legacyFallbackMs: number, updatedAtRaw?: unknown): number {
  if (isBrokenServerTimestampMap(raw)) {
    const fromUpdated = tryParseFirestoreTime(updatedAtRaw);
    if (fromUpdated != null) return fromUpdated;
    return Date.now();
  }
  const direct = tryParseFirestoreTime(raw);
  if (direct != null) return direct;
  return legacyFallbackMs;
}

function mergeBookingDays(raw: Record<string, unknown> | undefined): BookingSettings["days"] {
  const keys = ["0", "1", "2", "3", "4", "5", "6"] as const;
  const result = { ...defaultBookingSettings.days };
  if (!raw || typeof raw !== "object") return result;
  for (const k of keys) {
    const src = (raw[k] ?? raw[String(Number(k))]) as {
      enabled?: boolean;
      start?: string;
      end?: string;
      breaks?: { start: string; end: string }[];
    };
    if (src && typeof src === "object") {
      result[k] = {
        enabled: src.enabled ?? false,
        start: typeof src.start === "string" ? src.start : "09:00",
        end: typeof src.end === "string" ? src.end : "17:00",
      };
      if (src.breaks?.length) {
        (result[k] as { breaks?: { start: string; end: string }[] }).breaks = src.breaks.filter(
          (b): b is { start: string; end: string } =>
            !!b && typeof b === "object" && typeof b.start === "string" && typeof b.end === "string"
        );
      }
    }
  }
  return result;
}

function timeRangeMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

function businessDayMinutes(dayCfg: {
  enabled?: boolean;
  start?: string;
  end?: string;
  breaks?: { start: string; end: string }[];
}): number {
  if (!dayCfg?.enabled) return 0;
  const start = typeof dayCfg.start === "string" ? dayCfg.start : "09:00";
  const end = typeof dayCfg.end === "string" ? dayCfg.end : "17:00";
  let m = timeRangeMinutes(start, end);
  for (const b of dayCfg.breaks ?? []) {
    if (b?.start && b?.end) m -= timeRangeMinutes(b.start, b.end);
  }
  return Math.max(0, m);
}

function capacityMinutesForDay(settings: BookingSettings, dateStr: string, activeWorkers: number): number {
  if (isClosedDate(settings, dateStr)) return 0;
  const dow = new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10))
  ).getDay();
  const dayKey = String(dow) as keyof BookingSettings["days"];
  return businessDayMinutes(settings.days[dayKey] ?? { enabled: false, start: "09:00", end: "17:00" }) * activeWorkers;
}

function isRevenueEligible(data: Record<string, unknown>): boolean {
  if (isDocCancelled(data)) return false;
  const s = String((data.status as string) ?? "").trim().toLowerCase();
  return s === "completed" || s === "confirmed" || s === "active" || s === "booked";
}

function numericBookingPrice(data: Record<string, unknown>): number {
  const raw = data.price ?? data.priceApplied ?? data.finalPrice;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

async function computeCurrentMonthDoc(
  db: Firestore,
  siteId: string,
  now: Date,
  /** When set (including null), skips reading analytics/deepArchiveMerge. */
  deepMergeDaysPreloaded?: Record<string, DeepArchiveDayAdjustments> | null
): Promise<CurrentMonthDoc> {
  const monthKey = monthKeyIsraelFromDate(now);
  const { year, month1 } = parseMonthKey(monthKey);
  const ymds = enumerateYmdInMonth(year, month1);
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(daysInMonth(year, month1)).padStart(2, "0")}`;
  const todayYmd = getDateYMDInTimezone(now, IL_TZ);
  const weekYmdsForChart = weekYmdsSundayToSaturdayContaining(todayYmd);
  const unionYmds = sortedUniqueYmds([...ymds, ...weekYmdsForChart]);
  const bookingsRangeStart = unionYmds[0] ?? monthStart;
  const bookingsRangeEnd = unionYmds[unionYmds.length - 1] ?? monthEnd;

  const firstOfMonthYmd = `${year}-${String(month1).padStart(2, "0")}-01`;
  const { start: monthStartMs } = zonedDayRangeEpochMs(firstOfMonthYmd, IL_TZ);

  const clientsColl = db.collection("sites").doc(siteId).collection("clients");

  const days: Record<string, StoredMetrics> = {};
  for (const ymd of unionYmds) days[ymd] = initMetrics();

  const [settingsSnap, workersSnap, allClientsSnap, siteSnap, bookingDocs] = await Promise.all([
    db.collection("sites").doc(siteId).collection("settings").doc("booking").get(),
    db.collection("sites").doc(siteId).collection("workers").get(),
    clientsColl.select("createdAt", "updatedAt").get(),
    db.collection("sites").doc(siteId).get(),
    fetchBookingDocsForAnalyticsRangeAdmin(db, siteId, bookingsRangeStart, bookingsRangeEnd),
  ]);

  const deepMergeSnap =
    deepMergeDaysPreloaded === undefined
      ? await db.collection("sites").doc(siteId).collection("analytics").doc("deepArchiveMerge").get()
      : null;

  const legacyCreatedFallbackMs = monthStartMs - 1;
  const clientCreatedMsList: number[] = [];
  for (const cd of allClientsSnap.docs) {
    const row = cd.data() as { createdAt?: unknown; updatedAt?: unknown };
    const createdRaw = row?.createdAt ?? cd.get("createdAt");
    const updatedRaw = row?.updatedAt ?? cd.get("updatedAt");
    clientCreatedMsList.push(parseClientCreatedEpochMs(createdRaw, legacyCreatedFallbackMs, updatedRaw));
  }

  const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
  const settings: BookingSettings = {
    ...defaultBookingSettings,
    ...settingsData,
    days: mergeBookingDays(settingsData.days as Record<string, unknown> | undefined),
    closedDates: Array.isArray(settingsData.closedDates) ? (settingsData.closedDates as BookingSettings["closedDates"]) : [],
  };

  const activeWorkers = Math.max(
    1,
    workersSnap.docs.filter((d) => (d.data() as { active?: boolean }).active !== false).length
  );

  for (const ymd of unionYmds) {
    days[ymd].capacityMinutes = capacityMinutesForDay(settings, ymd, activeWorkers);
  }

  for (const doc of bookingDocs) {
    const d = doc.data() as Record<string, unknown>;
    const ymd = bookingDayYmdIsrael(d);
    if (ymd.length < 10 || !days[ymd]) continue;

    /** Cancelled / no-show / archive-cancelled snapshots — excluded from bookings & revenue (see {@link isDocCancelled}). */
    const cancelled = isDocCancelled(d);
    const followUp = isFollowUpBooking(d);
    const dur = Math.max(0, typeof d.durationMin === "number" && Number.isFinite(d.durationMin) ? d.durationMin : 60);
    const src = typeof d.bookingTrafficSource === "string" ? d.bookingTrafficSource.trim().toLowerCase() : "";

    if (cancelled) {
      days[ymd].cancellations += 1;
      continue;
    }

    /** One logical visit: count only phase 1; phase 2 is same appointment (calendar still has two docs). */
    if (!followUp) days[ymd].bookings += 1;
    days[ymd].bookedMinutes += dur;
    if (isRevenueEligible(d)) days[ymd].revenue += numericBookingPrice(d);
    if (!followUp && src) days[ymd].trafficAttributedBookings += 1;
  }

  const mergeDays =
    deepMergeDaysPreloaded !== undefined
      ? deepMergeDaysPreloaded
      : deepMergeSnap != null && deepMergeSnap.exists
        ? (deepMergeSnap.data() as { days?: Record<string, DeepArchiveDayAdjustments> }).days
        : undefined;
  applyDeepMergeToDays(days, unionYmds, mergeDays ?? null);

  for (const ymd of unionYmds) {
    const { start: dayStartMs, endExclusive: dayEndMs } = zonedDayRangeEpochMs(ymd, IL_TZ);
    days[ymd].newClients = clientCreatedMsList.filter((ms) => ms >= dayStartMs && ms < dayEndMs).length;
    days[ymd].clientsCumulative = clientCreatedMsList.filter((ms) => ms < dayEndMs).length;
    days[ymd].utilizationPercent =
      days[ymd].capacityMinutes > 0
        ? Math.min(100, Math.round((days[ymd].bookedMinutes / days[ymd].capacityMinutes) * 1000) / 10)
        : 0;
  }

  const siteData = siteSnap.data() as { whatsappUtilitySent?: number; whatsappServiceSent?: number } | undefined;
  const whatsappUsed = Math.max(
    0,
    (typeof siteData?.whatsappUtilitySent === "number" ? siteData.whatsappUtilitySent : 0) +
      (typeof siteData?.whatsappServiceSent === "number" ? siteData.whatsappServiceSent : 0)
  );
  const elapsedDays = Math.max(1, Number(todayYmd.slice(8, 10)));
  const base = Math.floor(whatsappUsed / elapsedDays);
  let rem = whatsappUsed - base * elapsedDays;
  for (let i = 1; i <= elapsedDays; i++) {
    const ymd = `${monthKey}-${String(i).padStart(2, "0")}`;
    if (!days[ymd]) continue;
    days[ymd].whatsappCount = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
  }

  const totals = initMetrics();
  for (const ymd of ymds) {
    const m = days[ymd];
    totals.revenue += m.revenue;
    totals.bookings += m.bookings;
    totals.whatsappCount += m.whatsappCount;
    totals.newClients += m.newClients;
    totals.cancellations += m.cancellations;
    totals.trafficAttributedBookings += m.trafficAttributedBookings;
    totals.bookedMinutes += m.bookedMinutes;
    totals.capacityMinutes += m.capacityMinutes;
  }
  const firstYmd = ymds[0] ?? monthStart;
  const lastYmd = ymds[ymds.length - 1] ?? monthEnd;
  let snapshotYmd = todayYmd;
  if (todayYmd < firstYmd) snapshotYmd = firstYmd;
  else if (todayYmd > lastYmd) snapshotYmd = lastYmd;
  const { endExclusive: snapshotDayEndMs } = zonedDayRangeEpochMs(snapshotYmd, IL_TZ);
  totals.clientsCumulative =
    days[snapshotYmd]?.clientsCumulative ?? clientCreatedMsList.filter((ms) => ms < snapshotDayEndMs).length;
  totals.utilizationPercent =
    totals.capacityMinutes > 0 ? Math.min(100, Math.round((totals.bookedMinutes / totals.capacityMinutes) * 1000) / 10) : 0;

  const siteOwner = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;

  return {
    monthKey,
    days,
    totals,
    updatedAt: Timestamp.now(),
    ownerUid: siteOwner?.ownerUid,
    ownerUserId: siteOwner?.ownerUserId,
  };
}

/**
 * Computes chart series in memory for the admin API without writing Firestore.
 * Each day’s `clientsCumulative` / `newClients` are derived from client `createdAt` (Israel midnight bounds), so history can slope within the week.
 */
export async function computeDashboardChartSeriesForSite(
  db: Firestore,
  siteId: string,
  now = new Date()
): Promise<DashboardChartSeriesBundleAdmin> {
  const deepMergeDays = await readDeepArchiveMergeDaysAdmin(db, siteId);
  const doc = await computeCurrentMonthDoc(db, siteId, now, deepMergeDays);

  const monthKeys = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return monthKeyFromDate(d);
  });

  const monthlyRefs = monthKeys
    .filter((k) => k !== doc.monthKey)
    .map((k) =>
      db.collection("sites").doc(siteId).collection("analytics").doc("monthly").collection("months").doc(k).get()
    );
  const monthlySnaps = await Promise.all(monthlyRefs);
  const monthlyMap = new Map<string, StoredMetrics>();
  for (const snap of monthlySnaps) {
    if (!snap.exists) continue;
    const row = snap.data() as { monthKey?: string; totals?: StoredMetrics };
    if (row.monthKey && row.totals) monthlyMap.set(row.monthKey, row.totals);
  }

  const base = buildDashboardChartSeriesFromCurrentDoc(doc, now);
  for (let i = 0; i < monthKeys.length; i++) {
    const k = monthKeys[i]!;
    const t = k === doc.monthKey ? doc.totals : monthlyMap.get(k) ?? initMetrics();
    const deep = sumDeepAdjustmentsForMonthKey(deepMergeDays, k);
    const addDeep = k === doc.monthKey ? initDeepArchiveZeros() : deep;
    base.year.revenue[i] = t.revenue + addDeep.revenue;
    base.year.bookings[i] = t.bookings + addDeep.bookings;
    base.year.whatsappCount[i] = t.whatsappCount;
    base.year.clientsCumulative[i] = t.clientsCumulative;
    base.year.newClients[i] = t.newClients;
    base.year.cancellations[i] = t.cancellations;
    base.year.utilizationPercent[i] = t.utilizationPercent;
    base.year.trafficAttributedBookings[i] = t.trafficAttributedBookings + addDeep.trafficAttributedBookings;
  }

  return base;
}

/**
 * Monthly “janitor”: when Israel month changes, copies the previous snapshot’s {@link CurrentMonthDoc.totals}
 * into `analytics/monthly/months/{monthKey}` for history, then **replaces** `analytics/dashboardCurrent` with a
 * freshly computed doc for the new month (new `days` map — no carry-over of prior month’s daily buckets).
 */
export async function rolloverAndRecomputeCurrentMonth(db: Firestore, siteId: string, now = new Date()): Promise<CurrentMonthDoc> {
  const currentRef = db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");
  const currentSnap = await currentRef.get();
  const currentMonthKey = monthKeyIsraelFromDate(now);

  if (currentSnap.exists) {
    const existing = currentSnap.data() as Partial<CurrentMonthDoc>;
    if (existing.monthKey && existing.monthKey !== currentMonthKey && existing.totals) {
      await db
        .collection("sites")
        .doc(siteId)
        .collection("analytics")
        .doc("monthly")
        .collection("months")
        .doc(existing.monthKey)
        .set(
          {
            monthKey: existing.monthKey,
            totals: existing.totals,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
    }
  }

  const recomputed = await computeCurrentMonthDoc(db, siteId, now);
  await currentRef.set(recomputed);
  return recomputed;
}

function mkSlice(labels: string[]): DashboardMetricSlice {
  const len = labels.length;
  const z = (): ChartMetricPoint[] => Array.from({ length: len }, () => 0);
  return {
    labels,
    revenue: z(),
    bookings: z(),
    whatsappCount: z(),
    clientsCumulative: z(),
    newClients: z(),
    cancellations: z(),
    utilizationPercent: z(),
    trafficAttributedBookings: z(),
  };
}

function fillSliceFromDayMap(
  slice: DashboardMetricSlice,
  ymds: string[],
  dayMap: Record<string, StoredMetrics>,
  todayYmd: string
) {
  const len = ymds.length;
  const bp: ChartMetricPoint[] = Array.from({ length: len }, () => 0);
  const bf: ChartMetricPoint[] = Array.from({ length: len }, () => 0);
  slice.bookingsPast = bp;
  slice.bookingsFuture = bf;

  for (let i = 0; i < ymds.length; i++) {
    const ymd = ymds[i]!;
    const m = dayMap[ymd] ?? initMetrics();
    const b = m.bookings;
    if (ymd > todayYmd) {
      slice.revenue[i] = null;
      slice.bookings[i] = b;
      bp[i] = 0;
      bf[i] = b;
      slice.whatsappCount[i] = null;
      slice.clientsCumulative[i] = null;
      slice.newClients[i] = null;
      slice.cancellations[i] = null;
      slice.utilizationPercent[i] = null;
      slice.trafficAttributedBookings[i] = null;
      continue;
    }
    slice.revenue[i] = m.revenue;
    slice.bookings[i] = b;
    bp[i] = b;
    bf[i] = 0;
    slice.whatsappCount[i] = m.whatsappCount;
    slice.clientsCumulative[i] = m.clientsCumulative;
    slice.newClients[i] = m.newClients;
    slice.cancellations[i] = m.cancellations;
    slice.utilizationPercent[i] = m.utilizationPercent;
    slice.trafficAttributedBookings[i] = m.trafficAttributedBookings;
  }
}

/** Full recompute + archived monthly merges (cron / internal); not used by the fast chart GET route. */
export async function getDashboardChartSeriesFromStore(db: Firestore, siteId: string, now = new Date()): Promise<DashboardChartSeriesBundleAdmin> {
  const current = await rolloverAndRecomputeCurrentMonth(db, siteId, now);
  const base = buildDashboardChartSeriesFromCurrentDoc(
    { monthKey: current.monthKey, days: current.days, totals: current.totals },
    now
  );

  const monthKeys = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return monthKeyFromDate(d);
  });

  const monthlyRefs = monthKeys
    .filter((k) => k !== current.monthKey)
    .map((k) =>
      db.collection("sites").doc(siteId).collection("analytics").doc("monthly").collection("months").doc(k).get()
    );
  const monthlySnaps = await Promise.all(monthlyRefs);
  const monthlyMap = new Map<string, StoredMetrics>();
  for (const snap of monthlySnaps) {
    if (!snap.exists) continue;
    const d = snap.data() as { monthKey?: string; totals?: StoredMetrics };
    if (d.monthKey && d.totals) monthlyMap.set(d.monthKey, d.totals);
  }

  const deepMergeDays = await readDeepArchiveMergeDaysAdmin(db, siteId);
  for (let i = 0; i < monthKeys.length; i++) {
    const k = monthKeys[i]!;
    const t = k === current.monthKey ? current.totals : monthlyMap.get(k) ?? initMetrics();
    const deep = sumDeepAdjustmentsForMonthKey(deepMergeDays, k);
    const addDeep = k === current.monthKey ? initDeepArchiveZeros() : deep;
    base.year.revenue[i] = t.revenue + addDeep.revenue;
    base.year.bookings[i] = t.bookings + addDeep.bookings;
    base.year.whatsappCount[i] = t.whatsappCount;
    base.year.clientsCumulative[i] = t.clientsCumulative;
    base.year.newClients[i] = t.newClients;
    base.year.cancellations[i] = t.cancellations;
    base.year.utilizationPercent[i] = t.utilizationPercent;
    base.year.trafficAttributedBookings[i] = t.trafficAttributedBookings + addDeep.trafficAttributedBookings;
  }

  return base;
}

/**
 * Builds chart slices from a persisted dashboardCurrent document only (no/monthly reads, no recompute).
 * Year view uses {@link CurrentMonthDoc.totals} for the document's monthKey in the rolling 12‑month window; other months are zero unless you merge archived monthly totals elsewhere.
 */
export function buildDashboardChartSeriesFromCurrentDoc(
  doc: Pick<CurrentMonthDoc, "monthKey" | "days" | "totals">,
  now: Date
): DashboardChartSeriesBundleAdmin {
  const { year, month1 } = parseMonthKey(doc.monthKey);
  const ymds = enumerateYmdInMonth(year, month1);
  const dayMap = doc.days ?? {};
  const totals = doc.totals ?? initMetrics();

  const todayIl = getDateYMDInTimezone(now, IL_TZ);
  const weekYmds = weekYmdsSundayToSaturdayContaining(todayIl);
  const week = mkSlice(weekYmds.map(formatWeekAxisEnglishWeekdayLong));
  week.titleLabels = weekYmds.map(formatWeekAxisLabelIsrael);
  fillSliceFromDayMap(week, weekYmds, dayMap, todayIl);

  const monthLabels = ymds.map((ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      timeZone: IL_TZ,
    });
  });
  const month = mkSlice(monthLabels);
  fillSliceFromDayMap(month, ymds, dayMap, todayIl);

  const monthKeys = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return monthKeyFromDate(d);
  });
  const yearLabels = monthKeys.map((k) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
  });
  const yearSlice = mkSlice(yearLabels);
  for (let i = 0; i < monthKeys.length; i++) {
    const k = monthKeys[i];
    const t = k === doc.monthKey ? totals : initMetrics();
    yearSlice.revenue[i] = t.revenue;
    yearSlice.bookings[i] = t.bookings;
    yearSlice.whatsappCount[i] = t.whatsappCount;
    yearSlice.clientsCumulative[i] = t.clientsCumulative;
    yearSlice.newClients[i] = t.newClients;
    yearSlice.cancellations[i] = t.cancellations;
    yearSlice.utilizationPercent[i] = t.utilizationPercent;
    yearSlice.trafficAttributedBookings[i] = t.trafficAttributedBookings;
  }

  return {
    week,
    month,
    year: yearSlice,
    fetchedAt: now.toISOString(),
  };
}
