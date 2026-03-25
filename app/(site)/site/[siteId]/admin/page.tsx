"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import CalenoLoading from "@/components/CalenoLoading";
import { fetchSiteStats, type SiteStats } from "@/lib/fetchSiteStats";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import {
  Users,
  Calendar,
  CalendarDays,
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
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { DashboardStatsLoading } from "@/components/admin/DashboardStatsLoading";
import {
  ExpandableAnalyticsStatCard,
  type DashboardChartSlices,
} from "@/components/admin/dashboard/ExpandableAnalyticsStatCard";
import { DEFAULT_WHATSAPP_USAGE_LIMIT } from "@/lib/whatsapp/constants";
import {
  fetchDashboardChartSeries,
  buildWhatsappChartSlices,
  type DashboardChartSeriesBundle,
  type MetricSlice,
} from "@/lib/fetchDashboardWeeklySeries";
import {
  getMockValuesForGranularity,
  mockChartLabels,
  type AnalyticsMetricKind,
} from "@/lib/analytics/MockData";

type MetricValueKey = Exclude<keyof MetricSlice, "labels">;

const METRIC_SLICE_KEY: Record<Exclude<AnalyticsMetricKind, "whatsapp">, MetricValueKey> = {
  revenue: "revenue",
  bookings: "bookings",
  clients: "clientsCumulative",
  newClients: "newClients",
  cancellations: "cancellations",
  utilization: "utilizationPercent",
  traffic: "trafficAttributedBookings",
};

function buildDashboardChartSlices(
  kind: AnalyticsMetricKind,
  bundle: DashboardChartSeriesBundle | null,
  whatsappUsed: number,
  chartFetchedAt: Date | null
): DashboardChartSlices {
  if (kind === "whatsapp") {
    return buildWhatsappChartSlices(whatsappUsed, chartFetchedAt ?? new Date());
  }
  if (!bundle) {
    return {
      day: { labels: mockChartLabels("day"), values: getMockValuesForGranularity(kind, "day") },
      week: { labels: mockChartLabels("week"), values: getMockValuesForGranularity(kind, "week") },
      month: { labels: mockChartLabels("month"), values: getMockValuesForGranularity(kind, "month") },
    };
  }
  const key = METRIC_SLICE_KEY[kind];
  return {
    day: { labels: bundle.day.labels, values: [...bundle.day[key]] },
    week: { labels: bundle.week.labels, values: [...bundle.week[key]] },
    month: { labels: bundle.month.labels, values: [...bundle.month[key]] },
  };
}

type DashboardMetrics = {
  ok?: boolean;
  cancellationsThisMonth?: number | null;
  cancellationsNote?: string;
  utilizationPercent?: number | null;
  bookedHoursThisMonth?: number;
  availableHoursThisMonth?: number;
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
  const [chartBundle, setChartBundle] = useState<DashboardChartSeriesBundle | null>(null);
  const [chartFetchedAt, setChartFetchedAt] = useState<Date | null>(null);

  const adminBasePath = getAdminBasePathFromSiteId(siteId);

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
        const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
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

  useEffect(() => {
    if (!siteId || siteId === "me" || !firebaseUser) {
      setChartBundle(null);
      setChartFetchedAt(null);
      return;
    }
    let cancelled = false;
    fetchDashboardChartSeries(siteId).then((b) => {
      if (!cancelled) {
        setChartBundle(b);
        setChartFetchedAt(b.fetchedAt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, firebaseUser]);

  const revenueFormatted =
    stats?.revenueThisMonth != null
      ? `\u200E${new Intl.NumberFormat("he-IL", {
          style: "currency",
          currency: "ILS",
          maximumFractionDigits: 0,
        }).format(stats.revenueThisMonth)}`
      : null;

  type DashboardStatRow =
    | {
        key: string;
        kind: "link";
        label: string;
        value: number | string | null;
        href: string;
        icon: LucideIcon;
        title?: string;
      }
    | {
        key: string;
        kind: "analytics";
        metricKind: AnalyticsMetricKind;
        label: string;
        value: number | string | null;
        href: string;
        icon: LucideIcon;
        title?: string;
      };

  const statCards = useMemo((): DashboardStatRow[] => {
    const trafficTop = (dashMetrics?.trafficBySource ?? []).slice(0, 3);
    const trafficValue =
      trafficTop.length > 0 ? trafficTop.map((t) => `${t.source}: ${t.count}`).join(" · ") : null;

    const dm = dashMetrics;
    const utilPct = dm?.utilizationPercent;
    const utilValue =
      dm != null && utilPct != null && Number.isFinite(utilPct)
        ? `\u200E${utilPct}%${
            dm.bookedHoursThisMonth != null && dm.availableHoursThisMonth != null
              ? ` (${dm.bookedHoursThisMonth}/${dm.availableHoursThisMonth} ש׳)`
              : ""
          }`
        : null;

    return [
      {
        key: "clients",
        kind: "analytics",
        metricKind: "clients" as const,
        label: "לקוחות",
        value: stats?.clientsCount ?? null,
        href: `${adminBasePath}/clients/client-card`,
        icon: Users,
      },
      {
        key: "newClients",
        kind: "analytics",
        metricKind: "newClients" as const,
        label: "לקוחות חדשים החודש",
        value: stats?.newCustomersThisMonth ?? null,
        href: `${adminBasePath}/clients/client-card`,
        icon: UserPlus,
      },
      {
        key: "bookingsToday",
        kind: "link",
        label: "תורים היום",
        value: stats?.bookingsToday ?? null,
        href: `${adminBasePath}/bookings`,
        icon: Calendar,
      },
      {
        key: "bookingsMonth",
        kind: "analytics",
        metricKind: "bookings",
        label: "תורים החודש",
        value: stats?.bookingsThisMonth ?? null,
        href: `${adminBasePath}/bookings`,
        icon: CalendarDays,
      },
      {
        key: "revenue",
        kind: "analytics",
        metricKind: "revenue",
        label: "הכנסות החודש",
        value: revenueFormatted,
        href: `${adminBasePath}/bookings`,
        icon: Banknote,
      },
      {
        key: "cancellations",
        kind: "analytics",
        metricKind: "cancellations" as const,
        label: "ביטולים החודש",
        value: dashMetrics?.cancellationsThisMonth ?? null,
        href: `${adminBasePath}/bookings`,
        icon: XCircle,
        title: dashMetrics?.cancellationsNote,
      },
      {
        key: "util",
        kind: "analytics",
        metricKind: "utilization" as const,
        label: "ניצולת זמן",
        value: utilValue,
        href: `${adminBasePath}/bookings`,
        icon: Percent,
      },
      {
        key: "traffic",
        kind: "analytics",
        metricKind: "traffic" as const,
        label: "מקור הגעה (קישור)",
        value: trafficValue,
        href: `${adminBasePath}/site`,
        icon: Link2,
      },
      {
        key: "whatsapp",
        kind: "analytics",
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
    <div dir="rtl" className="min-h-screen">
      <div className="mx-auto max-w-4xl">
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
                      {statCards.map((row) =>
                        row.kind === "analytics" ? (
                          <ExpandableAnalyticsStatCard
                            key={row.key}
                            label={row.label}
                            value={row.value}
                            href={row.href}
                            icon={row.icon}
                            title={row.title}
                            chartSlices={buildDashboardChartSlices(
                              row.metricKind,
                              chartBundle,
                              whatsAppThisMonth?.used ?? 0,
                              chartFetchedAt
                            )}
                            formatChartY={
                              row.metricKind === "revenue"
                                ? formatRevenueAxis
                                : row.metricKind === "utilization"
                                  ? formatPercentAxis
                                  : (n) => `\u200E${Math.round(n)}`
                            }
                            detailNote={
                              row.metricKind === "cancellations"
                                ? "הגרף מבוסס על ביטולים במסמכי התורים; לא כולל כל הארכיון."
                                : row.metricKind === "whatsapp"
                                  ? "אין יומן שליחות לפי שעה/יום; הגרף מפיץ את ספירת החודש הנוכחי על פי 24 שעות / 7 ימים / 30 ימים."
                                  : row.metricKind === "revenue"
                                    ? "הגרף מציג הכנסות מתורים שאינם מבוטלים ובסטטוס מאושר/פעיל/נקבע; המספר הגדול למעלה הוא סיכום החודש לפי כל התורים ביומן."
                                    : undefined
                            }
                          />
                        ) : (
                          <AdminStatCard
                            key={row.key}
                            label={row.label}
                            value={row.value}
                            href={row.href}
                            icon={row.icon}
                            title={row.title}
                          />
                        )
                      )}
                    </motion.div>
                  )}
                </div>

                <p className="relative z-10 text-sm text-[#64748B]">
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
