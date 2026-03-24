"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import CalenoLoading from "@/components/CalenoLoading";
import { fetchSiteStats, type SiteStats } from "@/lib/fetchSiteStats";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { Users, Calendar, UserCircle, CalendarDays, LogOut, MessageSquare } from "lucide-react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { DEFAULT_WHATSAPP_USAGE_LIMIT } from "@/lib/whatsapp/constants";

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
  const [loggingOut, setLoggingOut] = useState(false);

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

  const statCards = [
    {
      label: "לקוחות",
      value: stats?.clientsCount ?? null,
      href: `${adminBasePath}/clients/client-card`,
      icon: Users,
    },
    {
      label: "אנשי צוות",
      value: stats?.workersCount ?? null,
      href: `${adminBasePath}/team/workers`,
      icon: UserCircle,
    },
    {
      label: "תורים השבוע",
      value: stats?.bookingsThisWeek ?? null,
      href: `${adminBasePath}/bookings`,
      icon: CalendarDays,
    },
    {
      label: "תורים קרובים",
      value: stats?.upcomingBookings ?? null,
      href: `${adminBasePath}/bookings`,
      icon: Calendar,
    },
    {
      label: "הודעות WhatsApp החודש",
      value:
        whatsAppThisMonth != null
          ? `${whatsAppThisMonth.used.toLocaleString("he-IL")} מתוך ${whatsAppThisMonth.limit.toLocaleString("he-IL")}`
          : null,
      href: `${adminBasePath}/whatsapp`,
      icon: MessageSquare,
    },
  ];

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
                  {statsLoading || whatsAppLoading ? (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="rounded-2xl border border-[#E2E8F0] bg-[rgba(30,111,124,0.06)] p-4 animate-pulse"
                        >
                          <div className="mb-3 h-4 w-16 rounded bg-[#E2E8F0]" />
                          <div className="h-8 w-12 rounded bg-[#E2E8F0]" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                      {statCards.map(({ label, value, href, icon }) => (
                        <AdminStatCard
                          key={label}
                          label={label}
                          value={value}
                          href={href}
                          icon={icon}
                        />
                      ))}
                    </div>
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
