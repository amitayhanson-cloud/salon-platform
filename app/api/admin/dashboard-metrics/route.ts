/**
 * GET /api/admin/dashboard-metrics?siteId=&month=YYYY-MM
 * Bearer Firebase ID token. Site owner only.
 * Returns: cancellations (month + today Israel), utilization (month + today), traffic sources.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isFollowUpBooking } from "@/lib/normalizeBooking";
import { isClosedDate } from "@/lib/closedDates";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import {
  countArchivedCancelledInAppointmentMonthAdmin,
  countCancelledInBookingsMonthSnapshot,
  isDocCancelled,
} from "@/lib/cancelledBookingShared";
import { getTodayYMDInTimezone } from "@/lib/expiredCleanupUtils";

const ISRAEL_TZ = "Asia/Jerusalem";

/** Weekday 0–6 (Sun–Sat) for calendar YYYY-MM-DD (timezone-agnostic date). */
function utcWeekdayFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInCalendarMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
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

function parseMonthKey(s: string | null | undefined): { key: string; y: number; m: number } | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  const [y, m] = t.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { key: t, y, m };
}

function serviceLabelFromBooking(data: Record<string, unknown>): string {
  const candidates = [data.serviceName, data.serviceType, data.service];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (value.length > 0) return value;
  }
  return "שירות לא ידוע";
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const monthParam = searchParams.get("month");

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    const ownerUserId = (siteDoc.data() as { ownerUserId?: string })?.ownerUserId;
    if (ownerUid !== uid && ownerUserId !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const now = new Date();
    const fallbackKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const parsed = parseMonthKey(monthParam) ?? parseMonthKey(fallbackKey);
    if (!parsed) {
      return NextResponse.json({ error: "invalid month" }, { status: 400 });
    }
    const { key: monthKey, y: year, m: month1 } = parsed;
    const monthStart = `${year}-${String(month1).padStart(2, "0")}-01`;
    const dim = daysInCalendarMonth(year, month1);
    const monthEnd = `${year}-${String(month1).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;

    const dashboardCurrentRef = db.collection("sites").doc(siteId).collection("analytics").doc("dashboardCurrent");

    const [settingsSnap, workersSnap, bookingsSnap, cancellationsFromArchive, dashboardCurrentSnap] = await Promise.all([
      db.collection("sites").doc(siteId).collection("settings").doc("booking").get(),
      db.collection("sites").doc(siteId).collection("workers").get(),
      db
        .collection("sites")
        .doc(siteId)
        .collection("bookings")
        .where("dateISO", ">=", monthStart)
        .where("dateISO", "<=", monthEnd)
        .get(),
      countArchivedCancelledInAppointmentMonthAdmin(db, siteId, monthStart, monthEnd),
      dashboardCurrentRef.get(),
    ]);

    const liveDash = dashboardCurrentSnap.exists
      ? (dashboardCurrentSnap.data() as Record<string, unknown>)
      : null;
    const liveMonthKey = typeof liveDash?.monthKey === "string" ? liveDash.monthKey : null;
    const useLiveScoreboard = liveMonthKey === monthKey;

    /** Same cancellation rules as /admin/.../cancelled; appointment date in this month */
    const cancellationsFromLiveBookings = countCancelledInBookingsMonthSnapshot(bookingsSnap.docs);
    const cancellationsThisMonth = cancellationsFromLiveBookings + cancellationsFromArchive;

    const todayYmd = getTodayYMDInTimezone(ISRAEL_TZ);
    let cancellationsFromLiveToday = 0;
    for (const doc of bookingsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (isFollowUpBooking(data)) continue;
      if (!isDocCancelled(data)) continue;
      const dateKey =
        typeof data.dateISO === "string" && data.dateISO.length >= 10 ? data.dateISO.slice(0, 10) : "";
      if (dateKey === todayYmd) cancellationsFromLiveToday += 1;
    }
    const cancellationsFromArchiveToday = await countArchivedCancelledInAppointmentMonthAdmin(
      db,
      siteId,
      todayYmd,
      todayYmd
    );
    const cancellationsToday = cancellationsFromLiveToday + cancellationsFromArchiveToday;

    const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
    const bookingSettings: BookingSettings = {
      ...defaultBookingSettings,
      ...settingsData,
      days: mergeBookingDays(settingsData.days as Record<string, unknown> | undefined),
      closedDates: Array.isArray(settingsData.closedDates) ? (settingsData.closedDates as BookingSettings["closedDates"]) : [],
    };

    const activeWorkers = Math.max(
      1,
      workersSnap.docs.filter((d) => (d.data() as { active?: boolean }).active !== false).length
    );

    let capacityMinutes = 0;
    for (let d = 1; d <= dim; d++) {
      const dateStr = `${year}-${String(month1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (isClosedDate(bookingSettings, dateStr)) continue;
      const dow = new Date(year, month1 - 1, d).getDay();
      const dayKey = String(dow) as keyof BookingSettings["days"];
      const dayCfg = bookingSettings.days[dayKey];
      capacityMinutes += businessDayMinutes(dayCfg ?? { enabled: false, start: "09:00", end: "17:00" }) * activeWorkers;
    }

    let bookedMinutes = 0;
    const trafficMap = new Map<string, number>();
    const servicesMap = new Map<string, number>();

    if (useLiveScoreboard) {
      const totals = liveDash?.totals as Record<string, unknown> | undefined;
      const bm = totals?.bookedMinutes;
      bookedMinutes = typeof bm === "number" && Number.isFinite(bm) ? Math.max(0, bm) : 0;
      const tsRaw = liveDash?.trafficSources as Record<string, unknown> | undefined;
      if (tsRaw && typeof tsRaw === "object") {
        for (const [k, v] of Object.entries(tsRaw)) {
          if (typeof v === "number" && Number.isFinite(v) && v > 0) {
            trafficMap.set(k, v);
          }
        }
      }
    } else {
      for (const doc of bookingsSnap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (isDocCancelled(d)) continue;

        const dm = typeof d.durationMin === "number" && Number.isFinite(d.durationMin) ? d.durationMin : 60;
        bookedMinutes += Math.max(0, dm);

        if (isFollowUpBooking(d)) continue;

        const src = typeof d.bookingTrafficSource === "string" ? d.bookingTrafficSource.trim().toLowerCase() : "";
        if (src) {
          trafficMap.set(src, (trafficMap.get(src) ?? 0) + 1);
        }
      }
    }

    for (const doc of bookingsSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      if (isDocCancelled(d) || isFollowUpBooking(d)) continue;
      const serviceLabel = serviceLabelFromBooking(d);
      servicesMap.set(serviceLabel, (servicesMap.get(serviceLabel) ?? 0) + 1);
    }

    const utilizationPercent =
      capacityMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 1000) / 10) : null;

    let capacityTodayMinutes = 0;
    if (!isClosedDate(bookingSettings, todayYmd)) {
      const dowToday = utcWeekdayFromYmd(todayYmd);
      const dayKeyToday = String(dowToday) as keyof BookingSettings["days"];
      const dayCfgToday = bookingSettings.days[dayKeyToday];
      capacityTodayMinutes =
        businessDayMinutes(dayCfgToday ?? { enabled: false, start: "09:00", end: "17:00" }) * activeWorkers;
    }

    let bookedTodayMinutes = 0;
    if (useLiveScoreboard) {
      const days = liveDash?.days as Record<string, Record<string, unknown>> | undefined;
      const dayRow = days?.[todayYmd];
      const dm = dayRow?.bookedMinutes;
      bookedTodayMinutes = typeof dm === "number" && Number.isFinite(dm) ? Math.max(0, dm) : 0;
    } else {
      for (const doc of bookingsSnap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (isDocCancelled(d)) continue;
        const dateKey =
          typeof d.dateISO === "string" && d.dateISO.length >= 10 ? d.dateISO.slice(0, 10) : "";
        if (dateKey !== todayYmd) continue;
        const dm = typeof d.durationMin === "number" && Number.isFinite(d.durationMin) ? d.durationMin : 60;
        bookedTodayMinutes += Math.max(0, dm);
      }
    }

    const utilizationPercentToday =
      capacityTodayMinutes > 0
        ? Math.min(100, Math.round((bookedTodayMinutes / capacityTodayMinutes) * 1000) / 10)
        : null;

    const trafficBySource = Array.from(trafficMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
    const servicePopularity = Array.from(servicesMap.entries())
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count);

    const totalAttributed = trafficBySource.reduce((s, x) => s + x.count, 0);
    let totalBookingsForTraffic = bookingsSnap.docs.filter((doc) => {
      const d = doc.data() as Record<string, unknown>;
      if (isFollowUpBooking(d)) return false;
      return !isDocCancelled(d);
    }).length;
    if (useLiveScoreboard) {
      const tb = (liveDash?.totals as Record<string, unknown> | undefined)?.bookings;
      totalBookingsForTraffic = typeof tb === "number" && Number.isFinite(tb) ? Math.max(0, tb) : 0;
    }

    return NextResponse.json({
      ok: true,
      monthKey,
      cancellationsThisMonth,
      cancellationsToday,
      utilizationPercent,
      utilizationPercentToday,
      bookedHoursThisMonth: Math.round((bookedMinutes / 60) * 10) / 10,
      availableHoursThisMonth: Math.round((capacityMinutes / 60) * 10) / 10,
      bookedHoursToday: Math.round((bookedTodayMinutes / 60) * 10) / 10,
      availableHoursToday: Math.round((capacityTodayMinutes / 60) * 10) / 10,
      trafficBySource,
      servicePopularity,
      totalBookingsWithSource: totalAttributed,
      totalBookingsInMonth: totalBookingsForTraffic,
    });
  } catch (e) {
    console.error("[dashboard-metrics]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
