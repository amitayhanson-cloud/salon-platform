"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import CalenoLoading from "@/components/CalenoLoading";
import { fetchSiteStats, type SiteStats } from "@/lib/fetchSiteStats";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { Users, Calendar, UserCircle, CalendarDays } from "lucide-react";

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
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <div className="rounded-xl border border-caleno-border bg-white p-6 shadow-sm md:p-10">
          {loading ? (
            <div className="flex min-h-[200px] w-full items-center justify-center bg-caleno-bg rounded-lg">
              <CalenoLoading />
            </div>
          ) : (
            <>
              <h1 className="mb-2 text-2xl font-bold text-caleno-ink md:text-3xl">
                {welcomeMessage}
              </h1>
              <p className="mb-8 text-caleno-deep/90">
                מה תרצה לעשות היום?
              </p>

              {/* Stats grid */}
              <div className="mb-10">
                <h2 className="mb-4 text-lg font-semibold text-caleno-ink">
                  סטטיסטיקות האתר
                </h2>
                {statsLoading ? (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-caleno-border bg-caleno-bg/50 p-4 animate-pulse"
                      >
                        <div className="h-4 w-16 rounded bg-caleno-border mb-3" />
                        <div className="h-8 w-12 rounded bg-caleno-border" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {statCards.map(({ label, value, href, icon: Icon }) => (
                      <Link
                        key={label}
                        href={href}
                        className="flex flex-col rounded-xl border border-caleno-border bg-white p-4 transition-colors hover:border-caleno-deep/40 hover:bg-caleno-off/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2"
                      >
                        <div className="flex items-center gap-2 text-caleno-deep mb-2">
                          <Icon className="h-4 w-4" aria-hidden />
                          <span className="text-sm font-medium text-caleno-ink/80">
                            {label}
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-caleno-ink tabular-nums">
                          {value !== null ? value : "—"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-sm text-caleno-deep/80">
                בחר מהתפריט למעלה כדי לנהל תורים, לקוחות, השירותים והאתר.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
