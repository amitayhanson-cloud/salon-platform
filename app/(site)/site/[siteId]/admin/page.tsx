"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import CalenoLoading from "@/components/CalenoLoading";
import { fetchSiteStats, type SiteStats } from "@/lib/fetchSiteStats";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import {
  Users,
  Calendar,
  LogOut,
  MessageSquare,
  UserPlus,
  Banknote,
  XCircle,
  Percent,
  Link2,
  Scissors,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { AdminCard } from "@/components/admin/AdminCard";
import { DashboardStatsLoading } from "@/components/admin/DashboardStatsLoading";
import {
  DashboardAnalyticsChartPanel,
  type DashboardChartSlices,
} from "@/components/admin/dashboard/DashboardAnalyticsChartPanel";
import {
  AnalyticsStatCardWithGraphScroll,
  STAT_MORPH_TRANSITION,
  type DashboardBentoSize,
} from "@/components/admin/dashboard/AnalyticsStatCardWithGraphScroll";
import type { DashboardChartYValueKind } from "@/components/admin/dashboard/DashboardMiniChart";
import { DEFAULT_WHATSAPP_USAGE_LIMIT } from "@/lib/whatsapp/constants";
import {
  type ChartGranularity,
  type DashboardChartSeriesBundle,
  type MetricSlice,
} from "@/lib/fetchDashboardWeeklySeries";
import {
  getMockValuesForGranularity,
  mockChartLabels,
  type AnalyticsMetricKind,
} from "@/lib/analytics/MockData";
import { bookingDayYmdIsrael } from "@/lib/bookingDayKey";
import { isDocCancelled } from "@/lib/cancelledBookingShared";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";

const DASHBOARD_DAY_TZ = "Asia/Jerusalem";

const BENTO_GRID_CLASS = {
  hero: "col-span-12 md:col-span-6",
  secondary: "col-span-12 md:col-span-4",
  small: "col-span-12 sm:col-span-6 md:col-span-3",
} as const;

/**
 * `fillSliceFromDayMap` nulls out future days using server time. Cached JSON can lag,
 * so the client may highlight “today” while that bucket is still null. Any bucket on or
 * before Israel’s current day/month is never “future” — coerce null → 0 for display.
 */
function coerceStaleFutureNullsForIsraelCalendar(
  values: (number | null)[],
  xCalendarIds: string[] | undefined,
  granularity: "week" | "month" | "year"
): (number | null)[] {
  if (!xCalendarIds || xCalendarIds.length !== values.length) return values;
  const ymd = getDateYMDInTimezone(new Date(), DASHBOARD_DAY_TZ);
  const ym = ymd.slice(0, 7);
  const out = values.slice();
  const isYear = granularity === "year";
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) continue;
    const id = xCalendarIds[i];
    if (id == null) continue;
    if (isYear) {
      if (id <= ym) out[i] = 0;
    } else if (id <= ymd) {
      out[i] = 0;
    }
  }
  return out;
}

type MetricValueKey = Exclude<
  keyof MetricSlice,
  | "labels"
  | "titleLabels"
  | "bookingsPast"
  | "bookingsFuture"
  | "todayHighlightIndex"
  | "xCalendarIds"
>;

const METRIC_SLICE_KEY: Record<AnalyticsMetricKind, MetricValueKey> = {
  revenue: "revenue",
  whatsapp: "whatsappCount",
  bookings: "bookings",
  clients: "clientsCumulative",
  newClients: "newClients",
  cancellations: "cancellations",
  utilization: "utilizationPercent",
  traffic: "trafficAttributedBookings",
  popularService: "bookings",
};

/** Graph block headings (granularity is שבוע/חודש/שנה — not “היום” on the title). */
const DASHBOARD_CHART_SECTION_TITLE: Record<AnalyticsMetricKind, string> = {
  clients: "לקוחות",
  newClients: "לקוחות חדשים",
  bookings: "תורים",
  revenue: "הכנסות",
  cancellations: "ביטולים",
  utilization: "ניצולת זמן",
  traffic: "מקור הגעה",
  whatsapp: "הודעות WhatsApp",
  popularService: "שירותים פופולריים",
};

function buildDashboardChartSlices(
  kind: AnalyticsMetricKind,
  bundle: DashboardChartSeriesBundle | null,
  whatsappUsed: number,
  chartFetchedAt: Date | null
): DashboardChartSlices {
  void whatsappUsed;
  void chartFetchedAt;
  if (!bundle) {
    return {
      week: { labels: mockChartLabels("week"), values: getMockValuesForGranularity(kind, "week") },
      month: { labels: mockChartLabels("month"), values: getMockValuesForGranularity(kind, "month") },
      year: { labels: mockChartLabels("year"), values: getMockValuesForGranularity(kind, "year") },
    };
  }
  const key = METRIC_SLICE_KEY[kind];
  const weekBookingsStacked =
    kind === "bookings" && bundle.week.bookingsPast && bundle.week.bookingsFuture
      ? { past: [...bundle.week.bookingsPast], future: [...bundle.week.bookingsFuture] }
      : undefined;
  const monthBookingsStacked =
    kind === "bookings" && bundle.month.bookingsPast && bundle.month.bookingsFuture
      ? { past: [...bundle.month.bookingsPast], future: [...bundle.month.bookingsFuture] }
      : undefined;
  return {
    week: {
      labels: bundle.week.labels,
      values: coerceStaleFutureNullsForIsraelCalendar(
        [...bundle.week[key]],
        bundle.week.xCalendarIds,
        "week"
      ),
      titleLabels: bundle.week.titleLabels,
      bookingsStacked: weekBookingsStacked,
      todayHighlightIndex: bundle.week.todayHighlightIndex,
      xCalendarIds: bundle.week.xCalendarIds,
    },
    month: {
      labels: bundle.month.labels,
      values: coerceStaleFutureNullsForIsraelCalendar(
        [...bundle.month[key]],
        bundle.month.xCalendarIds,
        "month"
      ),
      bookingsStacked: monthBookingsStacked,
      todayHighlightIndex: bundle.month.todayHighlightIndex,
      xCalendarIds: bundle.month.xCalendarIds,
    },
    year: {
      labels: bundle.year.labels,
      values: coerceStaleFutureNullsForIsraelCalendar(
        [...bundle.year[key]],
        bundle.year.xCalendarIds,
        "year"
      ),
      todayHighlightIndex: bundle.year.todayHighlightIndex,
      xCalendarIds: bundle.year.xCalendarIds,
    },
  };
}

type DashboardMetrics = {
  ok?: boolean;
  cancellationsThisMonth?: number | null;
  cancellationsToday?: number | null;
  cancellationsNote?: string;
  utilizationPercent?: number | null;
  utilizationPercentToday?: number | null;
  bookedHoursThisMonth?: number;
  availableHoursThisMonth?: number;
  bookedHoursToday?: number;
  availableHoursToday?: number;
  trafficBySource?: { source: string; count: number }[];
  servicePopularity?: { service: string; count: number }[];
};

export default function AdminHomePage() {
  const params = useParams();
  const router = useRouter();
  const siteId = (params?.siteId as string) || "";
  const { user, firebaseUser, loading, logout } = useAuth();
  const [whatsAppThisMonth, setWhatsAppThisMonth] = useState<{
    used: number;
    limit: number;
  } | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(true);
  const [dashMetrics, setDashMetrics] = useState<DashboardMetrics | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  /** `null` = grid of stat cards; key = single metric chart shown in place of the grid */
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
  /** Lifted from chart panel so week/month/year survives remounts when `chartSlices` is rebuilt each render. */
  const [expandedChartGranularity, setExpandedChartGranularity] = useState<ChartGranularity>("week");
  const adminBasePath = getAdminBasePathFromSiteId(siteId);

  const chartSwrKey =
    siteId && siteId !== "me" && firebaseUser
      ? (["admin-dashboard-chart-series", siteId, firebaseUser.uid] as const)
      : null;

  const statsSwrKey =
    siteId && siteId !== "me" && firebaseUser
      ? (["admin-site-stats", siteId, firebaseUser.uid] as const)
      : null;

  const {
    data: stats,
    isLoading: statsIsLoading,
    mutate: mutateSiteStats,
  } = useSWR(
    statsSwrKey,
    async ([, sid]) => fetchSiteStats(sid),
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  /** First paint: no cards until stats resolve (fetchSiteStats always returns an object, never throws). */
  const statsLoading = Boolean(statsSwrKey && stats === undefined && statsIsLoading);

  const { data: chartApiRaw, isLoading: chartSeriesIsLoading } = useSWR(
    chartSwrKey,
    async ([, sid]) => {
      const token = await firebaseUser!.getIdToken();
      const res = await fetch(
        `/api/admin/dashboard-chart-series?siteId=${encodeURIComponent(sid)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = (await res.json().catch(() => ({}))) as
        | {
            ok?: boolean;
            fetchedAt?: string;
            week?: DashboardChartSeriesBundle["week"];
            month?: DashboardChartSeriesBundle["month"];
            year?: DashboardChartSeriesBundle["year"];
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "chart_fetch_failed");
      }
      return json;
    },
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  /** Chart uses server admin reads; stat cards use client Firestore — refresh stats whenever chart data refetches so “היום” stays aligned. */
  const chartFetchedAt =
    chartApiRaw && typeof chartApiRaw === "object" && typeof (chartApiRaw as { fetchedAt?: unknown }).fetchedAt === "string"
      ? (chartApiRaw as { fetchedAt: string }).fetchedAt
      : null;

  useEffect(() => {
    if (!statsSwrKey || !chartFetchedAt) return;
    void mutateSiteStats();
  }, [chartFetchedAt, statsSwrKey, mutateSiteStats]);

  const chartBundle = useMemo((): DashboardChartSeriesBundle | null => {
    if (!chartApiRaw?.week || !chartApiRaw?.month || !chartApiRaw?.year) return null;
    const fetchedAt =
      typeof chartApiRaw.fetchedAt === "string" ? new Date(chartApiRaw.fetchedAt) : new Date();
    return {
      week: chartApiRaw.week,
      month: chartApiRaw.month,
      year: chartApiRaw.year,
      fetchedAt,
    };
  }, [chartApiRaw]);

  const chartSeriesLoading = chartSeriesIsLoading && !chartBundle;

  const welcomeMessage = user?.name
    ? `ברוך שובך – ${user.name}`
    : "ברוך שובך";

  useEffect(() => {
    setSelectedMetricKey(null);
  }, [siteId]);

  useEffect(() => {
    if (selectedMetricKey == null) {
      setExpandedChartGranularity("week");
    }
  }, [selectedMetricKey]);

  useEffect(() => {
    if (!siteId || !firebaseUser) {
      setWhatsAppLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setWhatsAppLoading(true);
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`/api/admin/whatsapp/monthly-count?siteId=${encodeURIComponent(siteId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          outboundCount?: unknown;
          usageLimit?: unknown;
        };
        if (!cancelled && res.ok) {
          const used =
            typeof data.outboundCount === "number" && Number.isFinite(data.outboundCount)
              ? Math.max(0, Math.floor(data.outboundCount))
              : null;
          const limit =
            typeof data.usageLimit === "number" && Number.isFinite(data.usageLimit) && data.usageLimit > 0
              ? Math.floor(data.usageLimit)
              : DEFAULT_WHATSAPP_USAGE_LIMIT;
          if (used !== null) {
            setWhatsAppThisMonth({ used, limit });
          } else {
            setWhatsAppThisMonth(null);
          }
        }
      } catch {
        if (!cancelled) setWhatsAppThisMonth(null);
      } finally {
        if (!cancelled) setWhatsAppLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, firebaseUser]);

  useEffect(() => {
    if (!siteId || !firebaseUser) {
      setDashLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setDashLoading(true);
        const month = getDateYMDInTimezone(new Date(), DASHBOARD_DAY_TZ).slice(0, 7);
        const token = await firebaseUser.getIdToken();
        const res = await fetch(
          `/api/admin/dashboard-metrics?siteId=${encodeURIComponent(siteId)}&month=${encodeURIComponent(month)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = (await res.json().catch(() => ({}))) as DashboardMetrics & { ok?: boolean };
        if (!cancelled && res.ok && data?.ok) {
          setDashMetrics(data);
        } else if (!cancelled) {
          setDashMetrics(null);
        }
      } catch {
        if (!cancelled) setDashMetrics(null);
      } finally {
        if (!cancelled) setDashLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, firebaseUser]);

  /**
   * Today’s revenue on the card should match the admin chart: both come from
   * `analytics/dashboardCurrent` (Cloud Functions). Client `fetchSiteStats` only queries
   * `dateISO` and used that for “today”, so new bookings could be missing or mis-bucketed.
   */
  const revenueTodayFromChart = useMemo(() => {
    const w = chartBundle?.week;
    if (!w?.xCalendarIds?.length || !Array.isArray(w.revenue)) return undefined;
    const todayYmd = getDateYMDInTimezone(new Date(), DASHBOARD_DAY_TZ);
    for (let i = 0; i < w.xCalendarIds.length; i++) {
      if (w.xCalendarIds[i] !== todayYmd) continue;
      const r = w.revenue[i];
      return typeof r === "number" && Number.isFinite(r) ? r : undefined;
    }
    return undefined;
  }, [chartBundle]);

  const revenueTodayNis =
    revenueTodayFromChart !== undefined
      ? revenueTodayFromChart
      : stats?.revenueToday != null && Number.isFinite(stats.revenueToday)
        ? stats.revenueToday
        : null;

  const revenueFormatted =
    revenueTodayNis != null
      ? `\u200E${new Intl.NumberFormat("he-IL", {
          style: "currency",
          currency: "ILS",
          maximumFractionDigits: 0,
        }).format(revenueTodayNis)}`
      : null;

  type DashboardStatRow = {
    key: string;
    metricKind: AnalyticsMetricKind;
    label: string;
    value: number | string | null;
    href: string;
    icon: LucideIcon;
    title?: string;
    bentoSize: DashboardBentoSize;
    gridClassName: string;
  };

  const trafficPieData = useMemo(() => {
    const src = dashMetrics?.trafficBySource ?? [];
    if (src.length === 0) return [];
    const top = src.slice(0, 5);
    const other = src.slice(5).reduce((s, x) => s + x.count, 0);
    const colors = ["#1e6f7c", "#2fb7b5", "#7eddd8", "#0f4550", "#155969", "#94a3b8"];
    const base = top.map((t, i) => ({
      id: `${t.source}-${i}`,
      label: t.source,
      value: t.count,
      color: colors[i % colors.length],
    }));
    if (other > 0) {
      base.push({
        id: "other",
        label: "אחר",
        value: other,
        color: colors[colors.length - 1],
      });
    }
    return base;
  }, [dashMetrics?.trafficBySource]);

  const formatUtilizationPercent = (value: number) => `\u200E${value.toFixed(1)}%`;

  const servicePopularityPieData = useMemo(() => {
    const rows = dashMetrics?.servicePopularity ?? [];
    if (rows.length === 0) return [];
    const colors = ["#1e6f7c", "#2fb7b5", "#7eddd8", "#0f4550", "#155969", "#94a3b8", "#0ea5a4"];
    return rows.map((row, i) => ({
      id: `service-${i}`,
      label: row.service,
      value: row.count,
      color: colors[i % colors.length],
    }));
  }, [dashMetrics?.servicePopularity]);

  const statCards = useMemo((): DashboardStatRow[] => {
    const trafficLeader = (dashMetrics?.trafficBySource ?? [])[0] ?? null;
    const trafficValue = trafficLeader ? `${trafficLeader.source}: ${trafficLeader.count}` : null;

    const dm = dashMetrics;
    const utilPct = dm?.utilizationPercentToday;
    const utilValue =
      dm != null && utilPct != null && Number.isFinite(utilPct)
        ? `${formatUtilizationPercent(utilPct)}${
            dm.bookedHoursToday != null && dm.availableHoursToday != null
              ? ` (${dm.bookedHoursToday}/${dm.availableHoursToday} ש׳)`
              : ""
          }`
        : null;
    const popularServiceTop = dm?.servicePopularity?.[0] ?? null;
    const popularServiceTotal = (dm?.servicePopularity ?? []).reduce((sum, row) => sum + row.count, 0);
    const popularServiceValue =
      popularServiceTop && popularServiceTotal > 0
        ? `${popularServiceTop.service} (${((popularServiceTop.count / popularServiceTotal) * 100).toFixed(1)}%)`
        : null;

    /** Bento order (RTL grid): heroes → secondaries → compact metrics */
    return [
      {
        key: "revenue",
        metricKind: "revenue" as const,
        label: "הכנסות היום",
        value: revenueFormatted,
        href: `${adminBasePath}/bookings`,
        icon: Banknote,
        bentoSize: "hero",
        gridClassName: BENTO_GRID_CLASS.hero,
      },
      {
        key: "bookingsToday",
        metricKind: "bookings",
        label: "תורים היום",
        value: stats?.bookingsToday ?? null,
        href: `${adminBasePath}/bookings`,
        icon: Calendar,
        bentoSize: "hero",
        gridClassName: BENTO_GRID_CLASS.hero,
      },
      {
        key: "newClients",
        metricKind: "newClients" as const,
        label: "לקוחות חדשים היום",
        value: stats?.newCustomersToday ?? null,
        href: `${adminBasePath}/clients/client-card`,
        icon: UserPlus,
        bentoSize: "secondary",
        gridClassName: BENTO_GRID_CLASS.secondary,
      },
      {
        key: "cancellations",
        metricKind: "cancellations" as const,
        label: "ביטולים היום",
        value: dashMetrics?.cancellationsToday ?? null,
        href: `${adminBasePath}/bookings`,
        icon: XCircle,
        title: dashMetrics?.cancellationsNote,
        bentoSize: "secondary",
        gridClassName: BENTO_GRID_CLASS.secondary,
      },
      {
        key: "clients",
        metricKind: "clients" as const,
        label: "לקוחות",
        value: stats?.clientsCount ?? null,
        href: `${adminBasePath}/clients/client-card`,
        icon: Users,
        bentoSize: "secondary",
        gridClassName: BENTO_GRID_CLASS.secondary,
      },
      {
        key: "whatsapp",
        metricKind: "whatsapp",
        label: "הודעות WhatsApp החודש",
        value:
          whatsAppThisMonth != null
            ? `\u200E${whatsAppThisMonth.used}/${whatsAppThisMonth.limit}`
            : null,
        href: `${adminBasePath}/whatsapp`,
        icon: MessageSquare,
        bentoSize: "small",
        gridClassName: BENTO_GRID_CLASS.small,
      },
      {
        key: "traffic",
        metricKind: "traffic" as const,
        label: "מקור הגעה (קישור)",
        value: trafficValue,
        href: `${adminBasePath}/site`,
        icon: Link2,
        bentoSize: "small",
        gridClassName: BENTO_GRID_CLASS.small,
      },
      {
        key: "popularService",
        metricKind: "popularService" as const,
        label: "השירות הכי פופולרי",
        value: popularServiceValue,
        href: `${adminBasePath}/services`,
        icon: Scissors,
        bentoSize: "small",
        gridClassName: BENTO_GRID_CLASS.small,
      },
      {
        key: "util",
        metricKind: "utilization" as const,
        label: "ניצולת זמן היום",
        value: utilValue,
        href: `${adminBasePath}/bookings`,
        icon: Percent,
        bentoSize: "small",
        gridClassName: BENTO_GRID_CLASS.small,
      },
    ];
  }, [adminBasePath, dashMetrics, revenueFormatted, stats, whatsAppThisMonth]);

  const heroSparklines = useMemo(() => {
    const w = whatsAppThisMonth?.used ?? 0;
    const fa = chartBundle?.fetchedAt ?? null;
    const revWeek = buildDashboardChartSlices("revenue", chartBundle, w, fa).week;
    const bookWeek = buildDashboardChartSlices("bookings", chartBundle, w, fa).week;
    let bookingsVals: (number | null)[] = [...bookWeek.values];
    if (bookWeek.bookingsStacked) {
      const { past, future } = bookWeek.bookingsStacked;
      bookingsVals = past.map((p, i) => (p ?? 0) + (future[i] ?? 0));
    }
    return {
      revenue: revWeek.values,
      bookingsToday: bookingsVals,
    };
  }, [chartBundle, whatsAppThisMonth]);

  const selectedStatRow = useMemo(
    () =>
      selectedMetricKey == null ? null : (statCards.find((r) => r.key === selectedMetricKey) ?? null),
    [selectedMetricKey, statCards]
  );

  const formatRevenueAxis = (n: number) =>
    `\u200E${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n)}`;

  const formatPercentAxis = (n: number) => formatUtilizationPercent(n);

  function formatChartYForMetric(kind: AnalyticsMetricKind): (n: number) => string {
    if (kind === "revenue") return formatRevenueAxis;
    if (kind === "utilization") return formatPercentAxis;
    return (n) => `\u200E${Math.round(n)}`;
  }

  function dashboardYValueKind(kind: AnalyticsMetricKind): DashboardChartYValueKind {
    if (kind === "revenue") return "currency";
    if (kind === "utilization") return "percent";
    return "count";
  }

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-6xl px-4 pb-16 lg:px-8">
        <AdminCard gradient className="relative overflow-x-hidden overflow-y-visible p-5 md:p-8 lg:p-10">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="absolute right-5 top-5 z-20 flex items-center justify-center gap-2 rounded-lg bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 md:right-8 md:top-8"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {loggingOut ? "מתנתק..." : "התנתקות"}
          </button>
          {/* Optional subtle grid overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage: "radial-gradient(100% 70% at 50% 0%, rgba(0,0,0,1), rgba(0,0,0,0.05))",
            }}
          />
          {loading ? (
            <div className="relative z-10 flex min-h-[200px] w-full items-center justify-center rounded-2xl bg-[rgba(30,111,124,0.04)]">
              <CalenoLoading />
            </div>
          ) : (
            <>
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="min-w-0 pt-12 text-center md:pt-2">
                  <h1 className="mb-2 text-pretty text-xl font-extrabold tracking-tight text-[#0F172A] md:text-2xl lg:text-3xl">
                    {welcomeMessage}
                  </h1>
                  <p className="mb-6 text-sm text-[#64748B] md:mb-8 md:text-base">
                    מה תרצה לעשות היום?
                  </p>
                </div>
              </div>

              <div className="relative z-10">
                <LayoutGroup id="dashboard-stat-morph">
                  <div className="mb-10">
                    <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">
                      סטטיסטיקות העסק
                    </h2>
                    {statsLoading ? (
                      <DashboardStatsLoading />
                    ) : selectedStatRow ? (
                      <div className="min-w-0 space-y-4">
                        <motion.button
                          type="button"
                          layout
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                          onClick={() => setSelectedMetricKey(null)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#1e6f7c]/30 bg-[#1e6f7c] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1e6f7c]/25 transition hover:bg-[#155a64] sm:w-auto sm:justify-start"
                        >
                          חזרה לכל המדדים
                        </motion.button>
                        {(() => {
                          const row = selectedStatRow;
                          const chartSlices = buildDashboardChartSlices(
                            row.metricKind,
                            chartBundle,
                            whatsAppThisMonth?.used ?? 0,
                            chartBundle?.fetchedAt ?? null
                          );
                          const Icon = row.icon;
                          const expandId = `dashboard-stat-${row.key}`;
                          return (
                            <motion.section
                              layoutId={expandId}
                              layout
                              transition={STAT_MORPH_TRANSITION}
                              className="relative scroll-mt-28 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-sm md:p-5 min-w-0"
                            >
                              <Link
                                href={row.href}
                                title="לדף הניהול"
                                aria-label={`לדף הניהול — ${row.label}`}
                                dir="rtl"
                                className="absolute top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full end-3 border border-slate-100 bg-white text-teal-600 shadow-sm transition hover:bg-teal-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/35 md:top-4 md:end-4"
                              >
                                <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
                              </Link>
                              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 pe-11 text-right sm:flex-row sm:items-center sm:justify-between md:pe-12">
                                <div className="min-w-0">
                                  <h3 className="text-base font-semibold text-slate-900">
                                    {DASHBOARD_CHART_SECTION_TITLE[row.metricKind]}
                                  </h3>
                                  <p className="mt-1 text-sm text-slate-600">{row.label}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
                                  <motion.span
                                    layoutId={`${expandId}-icon`}
                                    transition={STAT_MORPH_TRANSITION}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-1 ring-teal-700/5 md:h-10 md:w-10"
                                  >
                                    <Icon className="h-4 w-4 md:h-[1.05rem] md:w-[1.05rem]" strokeWidth={2} aria-hidden />
                                  </motion.span>
                                  <motion.p
                                    layoutId={`${expandId}-value`}
                                    transition={STAT_MORPH_TRANSITION}
                                    className="text-lg font-bold leading-snug text-slate-900 tabular-nums md:text-2xl md:leading-tight"
                                  >
                                    {row.value !== null && row.value !== undefined ? row.value : "—"}
                                  </motion.p>
                                </div>
                              </div>
                              <motion.div
                                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.32, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                              >
                                <DashboardAnalyticsChartPanel
                                  chartSlices={chartSlices}
                                  granularity={expandedChartGranularity}
                                  onGranularityChange={setExpandedChartGranularity}
                                  formatChartY={formatChartYForMetric(row.metricKind)}
                                  yValueKind={dashboardYValueKind(row.metricKind)}
                                  pieData={
                                    row.metricKind === "traffic"
                                      ? trafficPieData
                                      : row.metricKind === "popularService"
                                        ? servicePopularityPieData
                                        : undefined
                                  }
                                  pieEmptyHint={
                                    row.metricKind === "traffic"
                                      ? "אין עדיין נתוני מקור הגעה מספיקים להצגת הגרף. ודאו שהעתקתם את הקישורים ממחולל הקישורים כדי שנוכל לעקוב מאיפה הלקוחות מגיעים."
                                      : undefined
                                  }
                                  pieEmptyActionLabel={
                                    row.metricKind === "traffic" ? "למחולל הקישורים" : undefined
                                  }
                                  pieEmptyActionHref={
                                    row.metricKind === "traffic"
                                      ? `${adminBasePath}/settings#marketing-link-generator`
                                      : undefined
                                  }
                                  chartSeriesLoading={chartSeriesLoading}
                                />
                              </motion.div>
                            </motion.section>
                          );
                        })()}
                      </div>
                    ) : (
                      <motion.div layout className="grid grid-cols-12 gap-6">
                        {statCards.map((row) => (
                          <AnalyticsStatCardWithGraphScroll
                            key={row.key}
                            label={row.label}
                            value={row.value}
                            href={row.href}
                            icon={row.icon}
                            title={row.title}
                            gridClassName={row.gridClassName}
                            bentoSize={row.bentoSize}
                            expandLayoutId={`dashboard-stat-${row.key}`}
                            sparklineValues={
                              row.key === "revenue"
                                ? heroSparklines.revenue
                                : row.key === "bookingsToday"
                                  ? heroSparklines.bookingsToday
                                  : undefined
                            }
                            onOpenChart={() => setSelectedMetricKey(row.key)}
                          />
                        ))}
                      </motion.div>
                    )}
                  </div>
                </LayoutGroup>

                <p className="relative z-10 mt-8 text-sm leading-relaxed text-[#64748B]">
                  בחר מהתפריט למעלה כדי לנהל תורים, לקוחות, השירותים והאתר.
                </p>
              </div>
            </>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
