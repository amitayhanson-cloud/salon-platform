/**
 * Dashboard chart series (client Firestore):
 * - day: last 24 hours, one point per hour (local time)
 * - week: last 7 calendar days, one point per day
 * - month: last 30 calendar days, one point per day
 *
 * Indices are oldest → newest within each granularity. Empty buckets are 0.
 */

import { query, where, getDocs, getDoc, Timestamp } from "firebase/firestore";
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
export const CHART_DAY_HOURS = 24;
export const CHART_WEEK_DAYS = 7;
export const CHART_MONTH_DAYS = 30;

/** @deprecated Use CHART_DAY_HOURS */
export const CHART_DAYS = CHART_DAY_HOURS;
/** @deprecated Use CHART_WEEK_DAYS */
export const CHART_WEEKS = CHART_WEEK_DAYS;
/** @deprecated Use CHART_MONTH_DAYS */
export const CHART_MONTHS = CHART_MONTH_DAYS;

export type ChartGranularity = "day" | "week" | "month";

export type MetricSlice = {
  labels: string[];
  bookings: number[];
  revenue: number[];
  clientsCumulative: number[];
  newClients: number[];
  cancellations: number[];
  utilizationPercent: number[];
  trafficAttributedBookings: number[];
};

export type DashboardChartSeriesBundle = {
  day: MetricSlice;
  week: MetricSlice;
  month: MetricSlice;
  /** Wall time when this bundle was computed (hourly chart window anchor). */
  fetchedAt: Date;
};

/** @deprecated Use DashboardChartSeriesBundle.week fields */
export type WeeklySeries = {
  bookings: number[];
  revenue: number[];
  clientsCumulative: number[];
  newClients: number[];
  cancellations: number[];
  utilizationPercent: number[];
  trafficAttributedBookings: number[];
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return ymdLocal(dt);
}

/** Start of the current local hour. */
function startOfLocalHour(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
}

/** Rolling 24h window: 24 hourly slots ending at the current hour start. */
function rolling24HourWindow(anchor: Date): { windowStart: Date; labels: string[] } {
  const endHour = startOfLocalHour(anchor);
  const windowStart = new Date(endHour.getTime() - (CHART_DAY_HOURS - 1) * 3600000);
  const labels: string[] = [];
  for (let i = 0; i < CHART_DAY_HOURS; i++) {
    const t = new Date(windowStart.getTime() + i * 3600000);
    labels.push(
      t.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false })
    );
  }
  return { windowStart, labels };
}

function hourSlotForAppointment(appointment: Date, windowStart: Date): number {
  const ms = appointment.getTime() - windowStart.getTime();
  if (ms < 0 || ms >= CHART_DAY_HOURS * 3600000) return -1;
  return Math.floor(ms / 3600000);
}

function lastNDayYmds(endYmd: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDaysYmd(endYmd, -(n - 1 - i)));
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

/** Appointment start in local time (for hourly bucketing). */
function appointmentLocalDate(data: Record<string, unknown>): Date | null {
  const dateISO = typeof data.dateISO === "string" ? data.dateISO.trim() : "";
  if (dateISO.length < 10) return null;
  const ymd = dateISO.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const timeRaw =
    (typeof data.timeHHmm === "string" && data.timeHHmm) ||
    (typeof data.time === "string" && data.time) ||
    "12:00";
  const parts = timeRaw.split(/[:.]/);
  const hh = parseInt(parts[0] ?? "12", 10);
  const mm = parseInt(parts[1] ?? "0", 10);
  return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 12, Number.isFinite(mm) ? mm : 0, 0, 0);
}

function emptySlice(len: number, labels: string[]): MetricSlice {
  const z = () => Array.from({ length: len }, () => 0);
  return {
    labels,
    bookings: z(),
    revenue: z(),
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
  const { windowStart, labels: hourLabels } = rolling24HourWindow(anchor);
  const weekYmds = lastNDayYmds(endYmd, CHART_WEEK_DAYS);
  const monthYmds = lastNDayYmds(endYmd, CHART_MONTH_DAYS);
  const weekL = weekDayLabels(weekYmds);
  const monthL = monthRangeDayLabels(monthYmds);

  const daySlice = emptySlice(CHART_DAY_HOURS, hourLabels);
  const weekSlice = emptySlice(CHART_WEEK_DAYS, weekL);
  const monthSlice = emptySlice(CHART_MONTH_DAYS, monthL);

  const emptyBundle: DashboardChartSeriesBundle = {
    day: daySlice,
    week: weekSlice,
    month: monthSlice,
    fetchedAt: anchor,
  };

  if (!db || !siteId) {
    return emptyBundle;
  }

  const queryStartYmd = addDaysYmd(endYmd, -(CHART_MONTH_DAYS + 3));

  try {
    const [settings, workersSnap, bookingsSnap, clientsSnap] = await Promise.all([
      loadBookingSettings(siteId),
      getDocs(workersCollection(siteId)),
      getDocs(
        query(
          bookingsCollection(siteId),
          where("dateISO", ">=", queryStartYmd),
          where("dateISO", "<=", endYmd)
        )
      ),
      getDocs(clientsCollection(siteId)),
    ]);

    const activeWorkers = Math.max(
      1,
      workersSnap.docs.filter((d) => (d.data() as { active?: boolean }).active !== false).length
    );

    const bookedMinH = Array.from({ length: CHART_DAY_HOURS }, () => 0);
    const bookedMinW = Array.from({ length: CHART_WEEK_DAYS }, () => 0);
    const bookedMinM = Array.from({ length: CHART_MONTH_DAYS }, () => 0);

    const ymdToWeekIndex = new Map(weekYmds.map((y, i) => [y, i]));
    const ymdToMonthIndex = new Map(monthYmds.map((y, i) => [y, i]));

    for (const doc of bookingsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.isArchived === true) continue;

      const dateISO = typeof data.dateISO === "string" ? data.dateISO.slice(0, 10) : "";
      const hi = (() => {
        const apt = appointmentLocalDate(data);
        return apt ? hourSlotForAppointment(apt, windowStart) : -1;
      })();
      const wi = dateISO.length >= 10 ? ymdToWeekIndex.get(dateISO) : undefined;
      const mi = dateISO.length >= 10 ? ymdToMonthIndex.get(dateISO) : undefined;

      const cancelled = isDocCancelled(data);
      const followUp = isFollowUpBooking(data);
      const price = numericBookingPrice(data);
      const dm = typeof data.durationMin === "number" && Number.isFinite(data.durationMin) ? data.durationMin : 60;
      const dur = Math.max(0, dm);
      const src = typeof data.bookingTrafficSource === "string" ? data.bookingTrafficSource.trim().toLowerCase() : "";

      if (cancelled) {
        if (hi >= 0) daySlice.cancellations[hi] += 1;
        if (wi !== undefined) weekSlice.cancellations[wi] += 1;
        if (mi !== undefined) monthSlice.cancellations[mi] += 1;
        continue;
      }

      // Bookings chart: all non-cancelled, non-archived docs (including follow-ups), per spec.
      if (hi >= 0) {
        daySlice.bookings[hi] += 1;
        bookedMinH[hi] += dur;
      }
      if (wi !== undefined) {
        weekSlice.bookings[wi] += 1;
        bookedMinW[wi] += dur;
      }
      if (mi !== undefined) {
        monthSlice.bookings[mi] += 1;
        bookedMinM[mi] += dur;
      }

      if (isRevenueEligible(data)) {
        if (hi >= 0) daySlice.revenue[hi] += price;
        if (wi !== undefined) weekSlice.revenue[wi] += price;
        if (mi !== undefined) monthSlice.revenue[mi] += price;
      }

      if (!followUp && src) {
        if (hi >= 0) daySlice.trafficAttributedBookings[hi] += 1;
        if (wi !== undefined) weekSlice.trafficAttributedBookings[wi] += 1;
        if (mi !== undefined) monthSlice.trafficAttributedBookings[mi] += 1;
      }
    }

    const capPerHour = activeWorkers * 60;
    for (let hi = 0; hi < CHART_DAY_HOURS; hi++) {
      const booked = bookedMinH[hi] ?? 0;
      daySlice.utilizationPercent[hi] =
        capPerHour > 0 ? Math.min(100, Math.round((booked / capPerHour) * 1000) / 10) : 0;
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
    clients.sort((a, b) => (a.created!.getTime() - b.created!.getTime()));

    const slotEndMs = (i: number) => windowStart.getTime() + (i + 1) * 3600000;
    let p = 0;
    for (let hi = 0; hi < CHART_DAY_HOURS; hi++) {
      const endMs = slotEndMs(hi);
      while (p < clients.length && clients[p]!.created!.getTime() <= endMs) p += 1;
      daySlice.clientsCumulative[hi] = clientsWithoutCreatedAt + p;
    }
    const startMs = windowStart.getTime();
    const windowEndMs = startMs + CHART_DAY_HOURS * 3600000;
    for (const c of clients) {
      const t = c.created!.getTime();
      if (t < startMs || t >= windowEndMs) continue;
      const hi = Math.floor((t - startMs) / 3600000);
      if (hi >= 0 && hi < CHART_DAY_HOURS) daySlice.newClients[hi] += 1;
    }

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
  } catch (e) {
    console.warn("[fetchDashboardChartSeries]", e);
  }

  return {
    day: daySlice,
    week: weekSlice,
    month: monthSlice,
    fetchedAt: anchor,
  };
}

export async function fetchDashboardWeeklySeries(siteId: string): Promise<WeeklySeries> {
  const b = await fetchDashboardChartSeries(siteId);
  const w = b.week;
  return {
    bookings: w.bookings,
    revenue: w.revenue,
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
export function deriveWhatsappHourlyFromMonthly(used: number): number[] {
  return distributeAcrossBins(used, uniformWeights(CHART_DAY_HOURS));
}

export function deriveWhatsappDailyFromMonthly(used: number): number[] {
  return distributeAcrossBins(used, uniformWeights(CHART_WEEK_DAYS));
}

export function deriveWhatsappWeeklyFromMonthly(used: number): number[] {
  return deriveWhatsappDailyFromMonthly(used);
}

export function deriveWhatsappMonthlyFromMonthlyTotal(used: number): number[] {
  return distributeAcrossBins(used, uniformWeights(CHART_MONTH_DAYS));
}

export function buildWhatsappChartSlices(
  used: number,
  anchor: Date
): Record<ChartGranularity, { labels: string[]; values: number[] }> {
  const endYmd = ymdLocal(anchor);
  const { labels: hourLabels } = rolling24HourWindow(anchor);
  const weekYmds = lastNDayYmds(endYmd, CHART_WEEK_DAYS);
  const monthYmds = lastNDayYmds(endYmd, CHART_MONTH_DAYS);
  return {
    day: { labels: hourLabels, values: deriveWhatsappHourlyFromMonthly(used) },
    week: { labels: weekDayLabels(weekYmds), values: deriveWhatsappDailyFromMonthly(used) },
    month: { labels: monthRangeDayLabels(monthYmds), values: deriveWhatsappMonthlyFromMonthlyTotal(used) },
  };
}
