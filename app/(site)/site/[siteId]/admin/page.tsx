"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import CalenoLoading from "@/components/CalenoLoading";
import { fetchSiteStats, type SiteStats } from "@/lib/fetchSiteStats";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { Users, Calendar, UserCircle, CalendarDays } from "lucide-react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStatCard } from "@/components/admin/AdminStatCard";

export default function AdminHomePage() {
  const params = useParams();
  const siteId = (params?.siteId as string) || "";
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
  ];

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
                  {statsLoading ? (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      {[1, 2, 3, 4].map((i) => (
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
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
