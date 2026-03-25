/**
 * Dashboard chart series (client Firestore):
 * - week: admin API uses Sun–Sat (Israel week); client fetch may differ
 * - month: calendar month days; future days may be null in admin API
 * - year: last 12 calendar months, one point per month
 *
 * Indices are oldest → newest. `null` = no bar (e.g. future day in admin charts).
 */

import { query, where, getDocs, getDoc, Timestamp } from "firebase/firestore";
import { analyticsRangeToStartAtBounds, bookingDayYmdIsrael } from "@/lib/bookingDayKey";
import { db } from "@/lib/firebaseClient";
import { bookingsCollection, clientsCollection, workersCollection } from "@/lib/firestorePaths";
import { bookingSettingsDoc } from "@/lib/firestoreBookingSettings";
import { ymdLocal } from "@/lib/dateLocal";
import { isClosedDate } from "@/lib/closedDates";
import { isDocCancelled } from "@/lib/cancelledBookingShared";
import { isFollowUpBooking } from "@/lib/normalizeBooking";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

/** Points per granularity (x-axis length). */
export const CHART_WEEK_DAYS = 7;
export const CHART_MONTH_DAYS = 30;
export const CHART_YEAR_MONTHS = 12;

/** @deprecated Use CHART_YEAR_MONTHS */
export const CHART_MONTHS = CHART_YEAR_MONTHS;
/** @deprecated Use CHART_WEEK_DAYS */
export const CHART_WEEKS = CHART_WEEK_DAYS;

export type ChartGranularity = "week" | "month" | "year";

/** Client-side series: numeric buckets only. */
type MetricSliceNumbers = {
  labels: string[];
  bookings: number[];
  revenue: number[];
  whatsappCount: number[];
  clientsCumulative: number[];
  newClients: number[];
  cancellations: number[];
  utilizationPercent: number[];
  trafficAttributedBookings: number[];
};

/** Dashboard charts may use `null` for “no bar” (e.g. future days on admin API). */
export type MetricSlice = {
  labels: string[];
  titleLabels?: string[];
  bookingsPast?: (number | null)[];
  bookingsFuture?: (number | null)[];
  bookings: (number | null)[];
  revenue: (number | null)[];
  whatsappCount: (number | null)[];
  clientsCumulative: (number | null)[];
  newClients: (number | null)[];
  cancellations: (number | null)[];
  utilizationPercent: (number | null)[];
  trafficAttributedBookings: (number | null)[];
};

export type DashboardChartSeriesBundle = {
  week: MetricSlice;
  month: MetricSlice;
  year: MetricSlice;
  /** Wall time when this bundle was computed. */
  fetchedAt: Date;
};

/** @deprecated Use DashboardChartSeriesBundle.week fields */
export type WeeklySeries = {
  bookings: (number | null)[];
  revenue: (number | null)[];
  whatsappCount: (number | null)[];
  clientsCumulative: (number | null)[];
  newClients: (number | null)[];
  cancellations: (number | null)[];
  utilizationPercent: (number | null)[];
  trafficAttributedBookings: (number | null)[];
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return ymdLocal(dt);
}

function enumerateYmdsInclusive(startYmd: string, endYmd: string): string[] {
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const out: string[] = [];
  let t = new Date(sy, sm - 1, sd).getTime();
  const endT = new Date(ey, em - 1, ed).getTime();
  while (t <= endT) {
    out.push(ymdLocal(new Date(t)));
    t += 86400000;
  }
  return out;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function lastNDayYmds(endYmd: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDaysYmd(endYmd, -(n - 1 - i)));
}

function monthStartYmd(dt: Date): string {
  return ymdLocal(new Date(dt.getFullYear(), dt.getMonth(), 1));
}

function lastNMonthStartYmds(anchor: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - (n - 1 - i), 1);
    return monthStartYmd(d);
  });
}

function weekDayLabels(ymds: string[]): string[] {
  return ymds.map((ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("he-IL", { weekday: "short" });
  });
}

function monthRangeDayLabels(ymds: string[]): string[] {
  return ymds.map((ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  });
}

function yearMonthLabels(monthStartYmds: string[]): string[] {
  return monthStartYmds.map((ymd) => {
    const [y, m] = ymd.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
  });
}

function numericBookingPrice(data: Record<string, unknown>): number {
  const raw = data.price ?? data.priceApplied ?? data.finalPrice;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  return 0;
}

/** Revenue: completed (literal) or product statuses that represent a kept appointment. */
function isRevenueEligible(data: Record<string, unknown>): boolean {
  if (isDocCancelled(data)) return false;
  const s = String((data.status as string) ?? "").trim().toLowerCase();
  return (
    s === "completed" ||
    s === "confirmed" ||
    s === "active" ||
    s === "booked"
  );
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

async function loadBookingSettings(siteId: string): Promise<BookingSettings> {
  const ref = bookingSettingsDoc(siteId);
  const snap = await getDoc(ref);
  const settingsData = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  return {
    ...defaultBookingSettings,
    ...(settingsData as Partial<BookingSettings>),
    days: mergeBookingDays(settingsData.days as Record<string, unknown> | undefined),
    closedDates: Array.isArray(settingsData.closedDates)
      ? (settingsData.closedDates as BookingSettings["closedDates"])
      : [],
  };
}

function tsToYmd(value: unknown): string | null {
  if (!value) return null;
  const d =
    value instanceof Timestamp
      ? value.toDate()
      : typeof (value as { toDate?: () => Date }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate()
        : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return ymdLocal(d);
}

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate();
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function capacityMinutesForDay(settings: BookingSettings, dateStr: string, activeWorkers: number): number {
  if (isClosedDate(settings, dateStr)) return 0;
  const dow = new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10))
  ).getDay();
  const dayKey = String(dow) as keyof BookingSettings["days"];
  const dayCfg = settings.days[dayKey];
  return businessDayMinutes(dayCfg ?? { enabled: false, start: "09:00", end: "17:00" }) * activeWorkers;
}

function emptySlice(len: number, labels: string[]): MetricSliceNumbers {
  const z = () => Array.from({ length: len }, () => 0);
  return {
    labels,
    bookings: z(),
    revenue: z(),
    whatsappCount: z(),
    clientsCumulative: z(),
    newClients: z(),
    cancellations: z(),
    utilizationPercent: z(),
    trafficAttributedBookings: z(),
  };
}

export async function fetchDashboardChartSeries(siteId: string): Promise<DashboardChartSeriesBundle> {
  const anchor = new Date();
  const endYmd = ymdLocal(anchor);
  const weekYmds = lastNDayYmds(endYmd, CHART_WEEK_DAYS);
  const monthYmds = lastNDayYmds(endYmd, CHART_MONTH_DAYS);
  const yearMonthStartYmds = lastNMonthStartYmds(anchor, CHART_YEAR_MONTHS);
  const weekL = weekDayLabels(weekYmds);
  const monthL = monthRangeDayLabels(monthYmds);
  const yearL = yearMonthLabels(yearMonthStartYmds);

  const weekSlice = emptySlice(CHART_WEEK_DAYS, weekL);
  const monthSlice = emptySlice(CHART_MONTH_DAYS, monthL);
  const yearSlice = emptySlice(CHART_YEAR_MONTHS, yearL);

  const emptyBundle: DashboardChartSeriesBundle = {
    week: weekSlice as MetricSlice,
    month: monthSlice as MetricSlice,
    year: yearSlice as MetricSlice,
    fetchedAt: anchor,
  };

  if (!db || !siteId) {
    return emptyBundle;
  }

  const queryStartYmd = yearMonthStartYmds[0] ?? addDaysYmd(endYmd, -365);

  try {
    const col = bookingsCollection(siteId);
    const { startMs, endExclusiveMs } = analyticsRangeToStartAtBounds(queryStartYmd, endYmd);
    const tsLow = Timestamp.fromMillis(startMs);
    const tsHigh = Timestamp.fromMillis(endExclusiveMs);

    const [settings, workersSnap, isoSnap, dateSnap, startAtSnapResult, clientsSnap] = await Promise.all([
      loadBookingSettings(siteId),
      getDocs(workersCollection(siteId)),
      getDocs(query(col, where("dateISO", ">=", queryStartYmd), where("dateISO", "<=", endYmd))),
      getDocs(query(col, where("date", ">=", queryStartYmd), where("date", "<=", endYmd))),
      (async () => {
        try {
          return await getDocs(query(col, where("startAt", ">=", tsLow), where("startAt", "<", tsHigh)));
        } catch (e) {
          console.warn("[fetchDashboardChartSeries] startAt range query failed", e);
          return null;
        }
      })(),
      getDocs(clientsCollection(siteId)),
    ]);

    const bookingSeen = new Set<string>();
    const bookingsSnapDocs: { id: string; data: () => Record<string, unknown> }[] = [];
    for (const snap of startAtSnapResult ? [isoSnap, dateSnap, startAtSnapResult] : [isoSnap, dateSnap]) {
      for (const doc of snap.docs) {
        if (!bookingSeen.has(doc.id)) {
          bookingSeen.add(doc.id);
          bookingsSnapDocs.push(doc);
        }
      }
    }

    const activeWorkers = Math.max(
      1,
      workersSnap.docs.filter((d) => (d.data() as { active?: boolean }).active !== false).length
    );

    const bookedMinW = Array.from({ length: CHART_WEEK_DAYS }, () => 0);
    const bookedMinM = Array.from({ length: CHART_MONTH_DAYS }, () => 0);
    const bookedMinY = Array.from({ length: CHART_YEAR_MONTHS }, () => 0);

    const ymdToWeekIndex = new Map(weekYmds.map((y, i) => [y, i]));
    const ymdToMonthIndex = new Map(monthYmds.map((y, i) => [y, i]));
    const ymToYearIndex = new Map(
      yearMonthStartYmds.map((startYmd, i) => [startYmd.slice(0, 7), i] as const)
    );

    for (const doc of bookingsSnapDocs) {
      const data = doc.data() as Record<string, unknown>;

      const dateISO = bookingDayYmdIsrael(data);
      const wi = dateISO.length >= 10 ? ymdToWeekIndex.get(dateISO) : undefined;
      const mi = dateISO.length >= 10 ? ymdToMonthIndex.get(dateISO) : undefined;
      const yi = dateISO.length >= 7 ? ymToYearIndex.get(dateISO.slice(0, 7)) : undefined;

      const cancelled = isDocCancelled(data);
      const followUp = isFollowUpBooking(data);
      const price = numericBookingPrice(data);
      const dm = typeof data.durationMin === "number" && Number.isFinite(data.durationMin) ? data.durationMin : 60;
      const dur = Math.max(0, dm);
      const src = typeof data.bookingTrafficSource === "string" ? data.bookingTrafficSource.trim().toLowerCase() : "";

      if (cancelled) {
        if (wi !== undefined) weekSlice.cancellations[wi] += 1;
        if (mi !== undefined) monthSlice.cancellations[mi] += 1;
        if (yi !== undefined) yearSlice.cancellations[yi] += 1;
        continue;
      }

      // Booked minutes: all active segments (main + follow-up). Booking count: one per visit (main only).
      if (wi !== undefined) {
        if (!followUp) weekSlice.bookings[wi] += 1;
        bookedMinW[wi] += dur;
      }
      if (mi !== undefined) {
        if (!followUp) monthSlice.bookings[mi] += 1;
        bookedMinM[mi] += dur;
      }
      if (yi !== undefined) {
        if (!followUp) yearSlice.bookings[yi] += 1;
        bookedMinY[yi] += dur;
      }

      if (isRevenueEligible(data)) {
        if (wi !== undefined) weekSlice.revenue[wi] += price;
        if (mi !== undefined) monthSlice.revenue[mi] += price;
        if (yi !== undefined) yearSlice.revenue[yi] += price;
      }

      if (!followUp && src) {
        if (wi !== undefined) weekSlice.trafficAttributedBookings[wi] += 1;
        if (mi !== undefined) monthSlice.trafficAttributedBookings[mi] += 1;
        if (yi !== undefined) yearSlice.trafficAttributedBookings[yi] += 1;
      }
    }

    for (let wi = 0; wi < CHART_WEEK_DAYS; wi++) {
      const ymd = weekYmds[wi]!;
      const cap = capacityMinutesForDay(settings, ymd, activeWorkers);
      const booked = bookedMinW[wi] ?? 0;
      weekSlice.utilizationPercent[wi] =
        cap > 0 ? Math.min(100, Math.round((booked / cap) * 1000) / 10) : 0;
    }

    for (let mi = 0; mi < CHART_MONTH_DAYS; mi++) {
      const ymd = monthYmds[mi]!;
      const cap = capacityMinutesForDay(settings, ymd, activeWorkers);
      const booked = bookedMinM[mi] ?? 0;
      monthSlice.utilizationPercent[mi] =
        cap > 0 ? Math.min(100, Math.round((booked / cap) * 1000) / 10) : 0;
    }

    for (let yi = 0; yi < CHART_YEAR_MONTHS; yi++) {
      const monthStart = yearMonthStartYmds[yi]!;
      const [y, m] = monthStart.split("-").map(Number);
      const monthEnd = ymdLocal(new Date(y, m, 0));
      const capEnd = minYmd(monthEnd, endYmd);
      let cap = 0;
      for (const d of enumerateYmdsInclusive(monthStart, capEnd)) {
        cap += capacityMinutesForDay(settings, d, activeWorkers);
      }
      const booked = bookedMinY[yi] ?? 0;
      yearSlice.utilizationPercent[yi] =
        cap > 0 ? Math.min(100, Math.round((booked / cap) * 1000) / 10) : 0;
    }

    type ClientRow = { created: Date; ymd: string | null };
    const clients: ClientRow[] = [];
    let clientsWithoutCreatedAt = 0;
    for (const c of clientsSnap.docs) {
      const cd = c.data() as { createdAt?: unknown };
      const created = tsToDate(cd.createdAt);
      const ymd = tsToYmd(cd.createdAt);
      if (created) clients.push({ created, ymd });
      else clientsWithoutCreatedAt += 1;
    }
    clients.sort((a, b) => a.created.getTime() - b.created.getTime());

    for (let wi = 0; wi < CHART_WEEK_DAYS; wi++) {
      const ymd = weekYmds[wi]!;
      weekSlice.newClients[wi] = clients.filter((c) => c.ymd === ymd).length;
      weekSlice.clientsCumulative[wi] =
        clientsWithoutCreatedAt + clients.filter((c) => c.ymd && c.ymd <= ymd).length;
    }

    for (let mi = 0; mi < CHART_MONTH_DAYS; mi++) {
      const ymd = monthYmds[mi]!;
      monthSlice.newClients[mi] = clients.filter((c) => c.ymd === ymd).length;
      monthSlice.clientsCumulative[mi] =
        clientsWithoutCreatedAt + clients.filter((c) => c.ymd && c.ymd <= ymd).length;
    }

    for (let yi = 0; yi < CHART_YEAR_MONTHS; yi++) {
      const startYmd = yearMonthStartYmds[yi]!;
      const [y, m] = startYmd.split("-").map(Number);
      const endMonthYmd = ymdLocal(new Date(y, m, 0));
      const capEnd = minYmd(endMonthYmd, endYmd);
      yearSlice.newClients[yi] = clients.filter((c) => c.ymd && c.ymd >= startYmd && c.ymd <= capEnd).length;
      yearSlice.clientsCumulative[yi] =
        clientsWithoutCreatedAt + clients.filter((c) => c.ymd && c.ymd <= capEnd).length;
    }
  } catch (e) {
    console.warn("[fetchDashboardChartSeries]", e);
  }

  return {
    week: weekSlice as MetricSlice,
    month: monthSlice as MetricSlice,
    year: yearSlice as MetricSlice,
    fetchedAt: anchor,
  };
}

export async function fetchDashboardWeeklySeries(siteId: string): Promise<WeeklySeries> {
  const b = await fetchDashboardChartSeries(siteId);
  const w = b.week;
  return {
    bookings: w.bookings,
    revenue: w.revenue,
    whatsappCount: w.whatsappCount,
    clientsCumulative: w.clientsCumulative,
    newClients: w.newClients,
    cancellations: w.cancellations,
    utilizationPercent: w.utilizationPercent,
    trafficAttributedBookings: w.trafficAttributedBookings,
  };
}

function distributeAcrossBins(used: number, weights: number[]): number[] {
  if (!Number.isFinite(used) || used <= 0) {
    return Array.from({ length: weights.length }, () => 0);
  }
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const v = Math.round(used * weights[i]);
    out.push(v);
    allocated += v;
  }
  out.push(Math.max(0, used - allocated));
  return out;
}

function uniformWeights(n: number): number[] {
  const w = 1 / n;
  return Array.from({ length: n }, () => w);
}

/** WhatsApp: no per-interval logs; spread monthly total across bins for chart shape. */
export function deriveWhatsappWeeklyFromMonthly(used: number): number[] {
  return distributeAcrossBins(used, uniformWeights(CHART_WEEK_DAYS));
}

export function deriveWhatsappMonthlyFromMonthly(used: number): number[] {
  return distributeAcrossBins(used, uniformWeights(CHART_MONTH_DAYS));
}

export function deriveWhatsappYearlyFromMonthlyTotal(used: number): number[] {
  return distributeAcrossBins(used, uniformWeights(CHART_YEAR_MONTHS));
}

export function buildWhatsappChartSlices(
  used: number,
  anchor: Date
): Record<ChartGranularity, { labels: string[]; values: number[] }> {
  const endYmd = ymdLocal(anchor);
  const weekYmds = lastNDayYmds(endYmd, CHART_WEEK_DAYS);
  const monthYmds = lastNDayYmds(endYmd, CHART_MONTH_DAYS);
  const yearMonthStartYmds = lastNMonthStartYmds(anchor, CHART_YEAR_MONTHS);
  return {
    week: { labels: weekDayLabels(weekYmds), values: deriveWhatsappWeeklyFromMonthly(used) },
    month: { labels: monthRangeDayLabels(monthYmds), values: deriveWhatsappMonthlyFromMonthly(used) },
    year: { labels: yearMonthLabels(yearMonthStartYmds), values: deriveWhatsappYearlyFromMonthlyTotal(used) },
  };
}
