"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
  type LucideIcon,
} from "lucide-react";
import { AdminCard } from "@/components/admin/AdminCard";
import { DashboardStatsLoading } from "@/components/admin/DashboardStatsLoading";
import {
  DashboardAnalyticsChartPanel,
  type DashboardChartSlices,
} from "@/components/admin/dashboard/DashboardAnalyticsChartPanel";
import { AnalyticsStatCardWithGraphScroll } from "@/components/admin/dashboard/AnalyticsStatCardWithGraphScroll";
import { DEFAULT_WHATSAPP_USAGE_LIMIT } from "@/lib/whatsapp/constants";
import {
  type DashboardChartSeriesBundle,
  type MetricSlice,
} from "@/lib/fetchDashboardWeeklySeries";
import {
  getMockValuesForGranularity,
  mockChartLabels,
  type AnalyticsMetricKind,
} from "@/lib/analytics/MockData";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";

const DASHBOARD_DAY_TZ = "Asia/Jerusalem";

type MetricValueKey = Exclude<
  keyof MetricSlice,
  "labels" | "titleLabels" | "bookingsPast" | "bookingsFuture"
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
      values: [...bundle.week[key]],
      titleLabels: bundle.week.titleLabels,
      bookingsStacked: weekBookingsStacked,
    },
    month: {
      labels: bundle.month.labels,
      values: [...bundle.month[key]],
      bookingsStacked: monthBookingsStacked,
    },
    year: { labels: bundle.year.labels, values: [...bundle.year[key]] },
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
};

export default function AdminHomePage() {
  const params = useParams();
  const router = useRouter();
  const siteId = (params?.siteId as string) || "";
  const { user, firebaseUser, loading, logout } = useAuth();
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [whatsAppThisMonth, setWhatsAppThisMonth] = useState<{
    used: number;
    limit: number;
  } | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(true);
  const [dashMetrics, setDashMetrics] = useState<DashboardMetrics | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const adminBasePath = getAdminBasePathFromSiteId(siteId);

  const chartSwrKey =
    siteId && siteId !== "me" && firebaseUser
      ? (["admin-dashboard-chart-series", siteId, firebaseUser.uid] as const)
      : null;

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
    if (!siteId) {
      setStatsLoading(false);
      return;
    }
    let cancelled = false;
    fetchSiteStats(siteId).then((data) => {
      if (!cancelled) {
        setStats(data);
        setStatsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

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

  const revenueFormatted =
    stats?.revenueToday != null
      ? `\u200E${new Intl.NumberFormat("he-IL", {
          style: "currency",
          currency: "ILS",
          maximumFractionDigits: 0,
        }).format(stats.revenueToday)}`
      : null;

  type DashboardStatRow = {
    key: string;
    metricKind: AnalyticsMetricKind;
    label: string;
    value: number | string | null;
    href: string;
    icon: LucideIcon;
    title?: string;
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

  const statCards = useMemo((): DashboardStatRow[] => {
    const trafficTop = (dashMetrics?.trafficBySource ?? []).slice(0, 3);
    const trafficValue =
      trafficTop.length > 0 ? trafficTop.map((t) => `${t.source}: ${t.count}`).join(" · ") : null;

    const dm = dashMetrics;
    const utilPct = dm?.utilizationPercentToday;
    const utilValue =
      dm != null && utilPct != null && Number.isFinite(utilPct)
        ? `\u200E${utilPct}%${
            dm.bookedHoursToday != null && dm.availableHoursToday != null
              ? ` (${dm.bookedHoursToday}/${dm.availableHoursToday} ש׳)`
              : ""
          }`
        : null;

    return [
      {
        key: "clients",
        metricKind: "clients" as const,
        label: "לקוחות",
        value: stats?.clientsCount ?? null,
        href: `${adminBasePath}/clients/client-card`,
        icon: Users,
      },
      {
        key: "newClients",
        metricKind: "newClients" as const,
        label: "לקוחות חדשים היום",
        value: stats?.newCustomersToday ?? null,
        href: `${adminBasePath}/clients/client-card`,
        icon: UserPlus,
      },
      {
        key: "bookingsToday",
        metricKind: "bookings",
        label: "תורים היום",
        value: stats?.bookingsToday ?? null,
        href: `${adminBasePath}/bookings`,
        icon: Calendar,
      },
      {
        key: "revenue",
        metricKind: "revenue",
        label: "הכנסות היום",
        value: revenueFormatted,
        href: `${adminBasePath}/bookings`,
        icon: Banknote,
      },
      {
        key: "cancellations",
        metricKind: "cancellations" as const,
        label: "ביטולים היום",
        value: dashMetrics?.cancellationsToday ?? null,
        href: `${adminBasePath}/bookings`,
        icon: XCircle,
        title: dashMetrics?.cancellationsNote,
      },
      {
        key: "util",
        metricKind: "utilization" as const,
        label: "ניצולת זמן היום",
        value: utilValue,
        href: `${adminBasePath}/bookings`,
        icon: Percent,
      },
      {
        key: "traffic",
        metricKind: "traffic" as const,
        label: "מקור הגעה (קישור)",
        value: trafficValue,
        href: `${adminBasePath}/site`,
        icon: Link2,
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
      },
    ];
  }, [adminBasePath, dashMetrics, revenueFormatted, stats, whatsAppThisMonth]);

  const formatRevenueAxis = (n: number) =>
    `\u200E${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n)}`;

  const formatPercentAxis = (n: number) => `\u200E${Math.round(n)}%`;

  function chartDetailNoteForMetric(kind: AnalyticsMetricKind): string | undefined {
    if (kind === "cancellations")
      return "המספר למעלה הוא ביטולים היום; הגרף מציג מגמות (לא רק היום). מבוסס על מסמכי התורים וארכיון מבוטלים לפי תאריך התור.";
    if (kind === "whatsapp")
      return "אין יומן שליחות לפי יום/חודש; הגרף מפיץ את ספירת החודש הנוכחי על פני שבוע/חודש/שנה.";
    if (kind === "utilization")
      return "המספר למעלה הוא ניצולת היום (דקות מתור לעומת קיבולת יום העסקים); הגרף מציג אותו מדד לפי ימים/חודשים.";
    if (kind === "bookings")
      return "המספר למעלה הוא מספר תורי היום (כמו ביומן). הגרף: ספירת תורים לפי תאריך התור — כהה = עבר/היום, בהיר = ימים עתידיים באותו חודש או שבוע.";
    if (kind === "clients")
      return "המספר למעלה הוא סך הלקוחות במערכת; בגרף: סה\"כ לקוחות בסוף כל יום (כולל כל מה שנוצר לפני תחילת החודש + חדשים מאז). מבוסס על מסמכי לקוח עם createdAt בישראל.";
    if (kind === "newClients")
      return "המספר למעלה הוא לקוחות שנרשמו היום (יצירה בישראל); בגרף: לקוחות חדשים לפי יום — ההפרש בעמודת «לקוחות» בין יום ליום שווה למספר החדשים באותו יום.";
    if (kind === "revenue")
      return "הגרף מציג הכנסות מתורים שאינם מבוטלים ובסטטוס מאושר/פעיל/נקבע; המספר למעלה הוא סכום היום (לפי יומן ישראל) ממחירי התורים — לא בהכרח זהה לכלל הזמנות היום.";
    return undefined;
  }

  function formatChartYForMetric(kind: AnalyticsMetricKind): (n: number) => string {
    if (kind === "revenue") return formatRevenueAxis;
    if (kind === "utilization") return formatPercentAxis;
    return (n) => `\u200E${Math.round(n)}`;
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

  const showStatsAndCharts = !statsLoading && !whatsAppLoading && !dashLoading;

  return (
    <div dir="rtl" className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-0">
        <AdminCard gradient className="relative overflow-hidden p-6 md:p-10">
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
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="absolute left-6 top-6 z-20 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? "מתנתק..." : "התנתקות"}
              </button>
              <div className="relative z-10">
                <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-[#0F172A] md:text-3xl">
                  {welcomeMessage}
                </h1>
                <p className="mb-8 text-[#64748B]">
                  מה תרצה לעשות היום?
                </p>

                <div className="mb-10">
                  <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">
                    סטטיסטיקות העסק
                  </h2>
                  {statsLoading || whatsAppLoading || dashLoading ? (
                    <DashboardStatsLoading />
                  ) : (
                    <motion.div layout className="grid grid-cols-2 gap-4 md:grid-cols-3">
                      {statCards.map((row) => (
                        <AnalyticsStatCardWithGraphScroll
                          key={row.key}
                          label={row.label}
                          value={row.value}
                          href={row.href}
                          icon={row.icon}
                          title={row.title}
                          chartSectionId={`dashboard-chart-${row.key}`}
                        />
                      ))}
                    </motion.div>
                  )}
                </div>

                <p className="relative z-10 mt-8 text-sm text-[#64748B]">
                  בחר מהתפריט למעלה כדי לנהל תורים, לקוחות, השירותים והאתר.
                </p>
              </div>
            </>
          )}
        </AdminCard>

        {loading ? null : showStatsAndCharts ? (
          <div className="mt-8">
            <h2 className="mb-2 text-lg font-semibold text-[#0F172A]">מגמות וגרפים</h2>
            <p className="mb-8 text-sm text-slate-500">
              לכל מדד יש כפתור גרף בכרטיס למעלה — לחיצה תגלול למקטע המתאים.
            </p>
            <div className="flex flex-col gap-12">
              {statCards.map((row) => {
                const chartSlices = buildDashboardChartSlices(
                  row.metricKind,
                  chartBundle,
                  whatsAppThisMonth?.used ?? 0,
                  chartBundle?.fetchedAt ?? null
                );
                return (
                  <section
                    key={row.key}
                    id={`dashboard-chart-${row.key}`}
                    className="scroll-mt-28 rounded-2xl border border-[#E2E8F0] bg-[rgba(30,111,124,0.04)] p-4 shadow-sm md:p-5"
                  >
                    <div className="mb-4 border-b border-[#E2E8F0]/90 pb-3">
                      <h3 className="text-base font-semibold text-[#0F172A]">
                        {DASHBOARD_CHART_SECTION_TITLE[row.metricKind]}
                      </h3>
                    </div>
                    <DashboardAnalyticsChartPanel
                      chartSlices={chartSlices}
                      formatChartY={formatChartYForMetric(row.metricKind)}
                      detailNote={chartDetailNoteForMetric(row.metricKind)}
                      pieData={row.metricKind === "traffic" ? trafficPieData : undefined}
                      chartSeriesLoading={chartSeriesLoading}
                      href={row.href}
                    />
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
