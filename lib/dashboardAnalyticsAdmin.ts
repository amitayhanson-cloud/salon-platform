import { type Firestore } from "firebase-admin/firestore";
import { getDateYMDInTimezone, zonedDayRangeEpochMs } from "@/lib/expiredCleanupUtils";
import { hebrewWeekChartAxisLabel } from "@/lib/hebrewWeekChartAxisLabel";
import { isClosedDate } from "@/lib/closedDates";
import type { StoredMetrics } from "@/lib/dashboardAnalyticsStoredMetrics";
import { zeroStoredMetrics, rolloverDashboardMonthIfNeeded } from "@/lib/liveStatsScorekeeper";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

const IL_TZ = "Asia/Jerusalem";

export type { StoredMetrics } from "@/lib/dashboardAnalyticsStoredMetrics";

export type CurrentMonthDoc = {
  monthKey: string;
  days: Record<string, StoredMetrics>;
  totals: StoredMetrics;
  updatedAt: import("firebase-admin/firestore").Timestamp;
  ownerUid?: string;
  ownerUserId?: string;
};

export type DashboardMetricSlice = {
  labels: string[];
  titleLabels?: string[];
  /** X-axis band index for Israel “today”; omitted when out of range. */
  todayHighlightIndex?: number;
  /**
   * One id per x-axis bar, same length as `labels`: week/month = YYYY-MM-DD, year = YYYY-MM.
   * Lets the client align “today” with the browser clock even if the bundle was built slightly earlier.
   */
  xCalendarIds?: string[];
  revenue: ChartMetricPoint[];
  bookings: ChartMetricPoint[];
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

async function loadClientsTotalCount(db: Firestore, siteId: string): Promise<number | null> {
  try {
    const agg = await db.collection("sites").doc(siteId).collection("clients").count().get();
    const n = agg.data().count;
    return Number.isFinite(n) ? Number(n) : null;
  } catch (e) {
    console.warn("[dashboardAnalyticsAdmin] loadClientsTotalCount", e);
    return null;
  }
}

/** Israel wall-clock month + offset (for year chart axis; avoids UTC/server-local drift). */
function monthKeyIsraelOffsetFrom(now: Date, deltaMonths: number): string {
  const ymd = getDateYMDInTimezone(now, IL_TZ);
  const y = Number(ymd.slice(0, 4));
  const m1 = Number(ymd.slice(5, 7));
  const d = new Date(Date.UTC(y, m1 - 1 + deltaMonths, 1));
  const ym = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  return `${ym}-${String(mo).padStart(2, "0")}`;
}

function daysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function enumerateYmdInMonth(year: number, month1: number): string[] {
  const dim = daysInMonth(year, month1);
  return Array.from(
    { length: dim },
    (_, i) => `${year}-${String(month1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
  );
}

function parseMonthKey(key: string): { year: number; month1: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month1: m };
}

/** `monthKey` = YYYY-MM in Israel for `now`. */
export function monthKeyIsraelFromDate(now: Date): string {
  return getDateYMDInTimezone(now, IL_TZ).slice(0, 7);
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

/** Same rules as GET /api/admin/dashboard-metrics (capacity from schedule × active workers). */
function capacityMinutesForCalendarDay(
  settings: BookingSettings,
  dateStr: string,
  activeWorkers: number
): number {
  if (isClosedDate(settings, dateStr)) return 0;
  const [y, m1, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m1 - 1, d).getDay();
  const dayKey = String(dow) as keyof BookingSettings["days"];
  const dayCfg = settings.days[dayKey];
  return businessDayMinutes(dayCfg ?? { enabled: false, start: "09:00", end: "17:00" }) * activeWorkers;
}

function sumCapacityMinutesForCalendarMonth(
  settings: BookingSettings,
  activeWorkers: number,
  monthKey: string
): number {
  const { year, month1 } = parseMonthKey(monthKey);
  const dim = daysInMonth(year, month1);
  let sum = 0;
  for (let d = 1; d <= dim; d++) {
    const dateStr = `${year}-${String(month1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    sum += capacityMinutesForCalendarDay(settings, dateStr, activeWorkers);
  }
  return sum;
}

export type UtilizationCapacityContext = {
  settings: BookingSettings;
  activeWorkers: number;
};

async function loadUtilizationCapacityContext(
  db: Firestore,
  siteId: string
): Promise<UtilizationCapacityContext | null> {
  try {
    const [settingsSnap, workersSnap] = await Promise.all([
      db.collection("sites").doc(siteId).collection("settings").doc("booking").get(),
      db.collection("sites").doc(siteId).collection("workers").get(),
    ]);
    const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
    const bookingSettings: BookingSettings = {
      ...defaultBookingSettings,
      ...settingsData,
      days: mergeBookingDays(settingsData.days as Record<string, unknown> | undefined),
      closedDates: Array.isArray(settingsData.closedDates)
        ? (settingsData.closedDates as BookingSettings["closedDates"])
        : [],
    };
    const activeWorkers = Math.max(
      1,
      workersSnap.docs.filter((d) => (d.data() as { active?: boolean }).active !== false).length
    );
    return { settings: bookingSettings, activeWorkers };
  } catch (e) {
    console.warn("[dashboardAnalyticsAdmin] loadUtilizationCapacityContext", e);
    return null;
  }
}

export type ChartMetricPoint = number | null;

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
  todayYmd: string,
  utilizationCapacity: UtilizationCapacityContext | null
) {
  const len = ymds.length;
  const bp: ChartMetricPoint[] = Array.from({ length: len }, () => 0);
  const bf: ChartMetricPoint[] = Array.from({ length: len }, () => 0);
  slice.bookingsPast = bp;
  slice.bookingsFuture = bf;

  let runningNewClients = 0;
  for (let i = 0; i < ymds.length; i++) {
    const ymd = ymds[i]!;
    const m = dayMap[ymd] ?? zeroStoredMetrics();
    const b = m.bookings;
    if (ymd > todayYmd) {
      slice.revenue[i] = null;
      slice.bookings[i] = b;
      bp[i] = 0;
      bf[i] = b;
      slice.whatsappCount[i] = null;
      slice.clientsCumulative[i] = null;
      slice.newClients[i] = null;
      // Still read from `days.{ymd}` — counts are tied to that calendar day (e.g. cancels of
      // upcoming appointments), not “has this wall day passed yet”.
      slice.cancellations[i] = m.cancellations;
      slice.utilizationPercent[i] = null;
      slice.trafficAttributedBookings[i] = m.trafficAttributedBookings;
      continue;
    }
    slice.revenue[i] = m.revenue;
    slice.bookings[i] = b;
    bp[i] = b;
    bf[i] = 0;
    slice.whatsappCount[i] = m.whatsappCount;
    runningNewClients += m.newClients;
    slice.clientsCumulative[i] = runningNewClients;
    slice.newClients[i] = m.newClients;
    slice.cancellations[i] = m.cancellations;
    const booked = m.bookedMinutes ?? 0;
    const cap = utilizationCapacity
      ? capacityMinutesForCalendarDay(utilizationCapacity.settings, ymd, utilizationCapacity.activeWorkers)
      : m.capacityMinutes ?? 0;
    slice.utilizationPercent[i] =
      cap > 0 ? Math.min(100, Math.round((booked / cap) * 1000) / 10) : 0;
    slice.trafficAttributedBookings[i] = m.trafficAttributedBookings;
  }
}

/**
 * Persisted month rollover only (no booking/client scans). Archives prior month totals to
 * analytics/monthly/months/{monthKey} when Israel month changes.
 */
export async function rolloverDashboardAnalyticsForSite(db: Firestore, siteId: string, now = new Date()): Promise<void> {
  await rolloverDashboardMonthIfNeeded(db, siteId, now);
}

/** @deprecated Use {@link rolloverDashboardAnalyticsForSite} */
export async function rolloverAndRecomputeCurrentMonth(db: Firestore, siteId: string, now = new Date()): Promise<void> {
  await rolloverDashboardAnalyticsForSite(db, siteId, now);
}

/**
 * Admin chart series from `analytics/dashboardCurrent` only. Missing doc or fields → zeros.
 */
export async function loadDashboardChartSeriesForSite(
  db: Firestore,
  siteId: string,
  now = new Date()
): Promise<DashboardChartSeriesBundleAdmin> {
  const dashRef = db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");
  const [snap, utilizationCapacity, clientsTotalCount] = await Promise.all([
    dashRef.get(),
    loadUtilizationCapacityContext(db, siteId),
    loadClientsTotalCount(db, siteId),
  ]);
  const fallbackKey = monthKeyIsraelFromDate(now);
  const rollingMonthKeys = Array.from({ length: 12 }, (_, i) => monthKeyIsraelOffsetFrom(now, -(11 - i)));

  const archivedMonthTotals: Record<string, StoredMetrics> = {};
  const historyMonthKeys = rollingMonthKeys.filter((k) => k !== fallbackKey);
  if (historyMonthKeys.length > 0) {
    const monthlyMonths = db
      .collection("sites")
      .doc(siteId)
      .collection("analytics")
      .doc("monthly")
      .collection("months");
    const monthSnaps = await Promise.all(historyMonthKeys.map((k) => monthlyMonths.doc(k).get()));
    for (const monthSnap of monthSnaps) {
      if (!monthSnap.exists) continue;
      const data = monthSnap.data() as { monthKey?: unknown; totals?: Partial<StoredMetrics> } | undefined;
      const monthKey = typeof data?.monthKey === "string" ? data.monthKey : monthSnap.id;
      const totals = data?.totals;
      if (!totals || typeof totals !== "object") continue;
      archivedMonthTotals[monthKey] = { ...zeroStoredMetrics(), ...totals };
    }
  }

  if (!snap.exists) {
    return buildDashboardChartSeriesFromCurrentDoc(
      { monthKey: fallbackKey, days: {}, totals: zeroStoredMetrics() },
      now,
      utilizationCapacity,
      archivedMonthTotals,
      clientsTotalCount
    );
  }
  const d = snap.data() as Partial<CurrentMonthDoc>;
  return buildDashboardChartSeriesFromCurrentDoc(
    {
      monthKey: typeof d.monthKey === "string" ? d.monthKey : fallbackKey,
      days: (d.days as Record<string, StoredMetrics>) ?? {},
      totals: (d.totals as StoredMetrics) ?? zeroStoredMetrics(),
    },
    now,
    utilizationCapacity,
    archivedMonthTotals,
    clientsTotalCount
  );
}

export function buildDashboardChartSeriesFromCurrentDoc(
  doc: Pick<CurrentMonthDoc, "monthKey" | "days" | "totals">,
  now: Date,
  utilizationCapacity: UtilizationCapacityContext | null = null,
  archivedMonthTotals: Record<string, StoredMetrics> = {},
  clientsTotalCount: number | null = null
): DashboardChartSeriesBundleAdmin {
  const { year, month1 } = parseMonthKey(doc.monthKey);
  const ymds = enumerateYmdInMonth(year, month1);
  const dayMap = doc.days ?? {};
  const totals = doc.totals ?? zeroStoredMetrics();

  const todayIl = getDateYMDInTimezone(now, IL_TZ);
  const weekYmds = weekYmdsSundayToSaturdayContaining(todayIl);
  const week = mkSlice(weekYmds.map((ymd) => hebrewWeekChartAxisLabel(ymd)));
  week.titleLabels = weekYmds.map(formatWeekAxisLabelIsrael);
  week.xCalendarIds = [...weekYmds];
  fillSliceFromDayMap(week, weekYmds, dayMap, todayIl, utilizationCapacity);

  const monthLabels = ymds.map((ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      timeZone: IL_TZ,
    });
  });
  const month = mkSlice(monthLabels);
  month.xCalendarIds = [...ymds];
  fillSliceFromDayMap(month, ymds, dayMap, todayIl, utilizationCapacity);

  const monthKeys = Array.from({ length: 12 }, (_, i) => monthKeyIsraelOffsetFrom(now, -(11 - i)));
  const yearLabels = monthKeys.map((k) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
  });
  const yearSlice = mkSlice(yearLabels);
  yearSlice.xCalendarIds = [...monthKeys];
  for (let i = 0; i < monthKeys.length; i++) {
    const k = monthKeys[i];
    const t = k === doc.monthKey ? totals : (archivedMonthTotals[k] ?? zeroStoredMetrics());
    yearSlice.revenue[i] = t.revenue;
    yearSlice.bookings[i] = t.bookings;
    yearSlice.whatsappCount[i] = t.whatsappCount;
    yearSlice.clientsCumulative[i] = t.clientsCumulative;
    yearSlice.newClients[i] = t.newClients;
    yearSlice.cancellations[i] = t.cancellations;
    yearSlice.trafficAttributedBookings[i] = t.trafficAttributedBookings;
    if (utilizationCapacity && k === doc.monthKey) {
      const monthCap = sumCapacityMinutesForCalendarMonth(
        utilizationCapacity.settings,
        utilizationCapacity.activeWorkers,
        k
      );
      yearSlice.utilizationPercent[i] =
        monthCap > 0
          ? Math.min(100, Math.round((t.bookedMinutes / monthCap) * 1000) / 10)
          : 0;
    } else {
      yearSlice.utilizationPercent[i] =
        t.capacityMinutes > 0
          ? Math.min(100, Math.round((t.bookedMinutes / t.capacityMinutes) * 1000) / 10)
          : 0;
    }
  }

  // Year clients should never collapse to zero when monthly totals omit `clientsCumulative`.
  if (clientsTotalCount != null && Number.isFinite(clientsTotalCount)) {
    let tailNewClients = 0;
    for (let i = monthKeys.length - 1; i >= 0; i--) {
      const monthNewClients = Number(yearSlice.newClients[i] ?? 0);
      const reconstructed = Math.max(0, clientsTotalCount - tailNewClients);
      const existing = Number(yearSlice.clientsCumulative[i] ?? 0);
      if (!Number.isFinite(existing) || existing <= 0) {
        yearSlice.clientsCumulative[i] = reconstructed;
      }
      tailNewClients += Number.isFinite(monthNewClients) ? monthNewClients : 0;
    }
  }

  const weekTodayIdx = weekYmds.indexOf(todayIl);
  if (weekTodayIdx >= 0) week.todayHighlightIndex = weekTodayIdx;

  const monthTodayIdx = ymds.indexOf(todayIl);
  if (monthTodayIdx >= 0) month.todayHighlightIndex = monthTodayIdx;

  // 12 rolling Israel months; last bucket is the current calendar month.
  yearSlice.todayHighlightIndex = monthKeys.length - 1;

  return {
    week,
    month,
    year: yearSlice,
    fetchedAt: now.toISOString(),
  };
}
