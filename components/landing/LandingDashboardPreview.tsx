"use client";

import Image from "next/image";
import { Calendar, Users, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mock data for dashboard preview cards */
const PREVIEW_MOCK_DATA = [
  { title: "יומן תורים", value: "24", icon: Calendar, iconClass: "bg-caleno-100 text-caleno-600" },
  { title: "לקוחות", value: "156", icon: Users, iconClass: "bg-sky-100 text-sky-600" },
  { title: "אתר העסק", value: "89", icon: Globe, iconClass: "bg-emerald-100 text-emerald-600" },
] as const;

/**
 * Dashboard preview card: Caleno logo + search bar + mock stat cards.
 * Sits in place of the former hero data section.
 */
export function LandingDashboardPreview() {
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm" aria-hidden>
        {/* Top bar – same card feel as hero */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] bg-caleno-off/50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative h-6 w-20 shrink-0">
              <Image
                src="/brand/caleno logo/caleno_logo_new.png"
                alt=""
                fill
                className="object-contain object-left"
              />
            </div>
          </div>
          <div className="hidden w-72 items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm sm:flex">
            <Search className="h-4 w-4 text-[#64748B]" />
            <span className="text-[#64748B]">חיפוש תורים, לקוחות...</span>
          </div>
          <div className="h-7 w-7 rounded-full bg-caleno-100" aria-hidden />
        </div>

        {/* Stat cards with mock data */}
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
          {PREVIEW_MOCK_DATA.map(({ title, value, icon: Icon, iconClass }) => (
            <StatCard
              key={title}
              title={title}
              value={value}
              icon={Icon}
              iconClass={iconClass}
            />
          ))}
        </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconClass,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
      <div className="mb-2 inline-flex items-center gap-2">
        <div
          className={cn(
            "grid h-6 w-6 place-items-center rounded-md",
            iconClass || "bg-caleno-100 text-caleno-600",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </div>
        <span className="text-sm text-[#64748B]">{title}</span>
      </div>
      <div className="text-2xl font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}
