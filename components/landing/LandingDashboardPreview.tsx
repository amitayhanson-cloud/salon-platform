"use client";

import Image from "next/image";
import { Calendar, Users, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Template-style dashboard preview card: white, rounded-3xl, overlapping the hero (-mt-10).
 * Matches the FlowAI template: top bar (logo, search, CTA) + stat cards.
 */
export function LandingDashboardPreview() {
  return (
    <section className="-mt-10" aria-hidden>
      <div
        className={cn(
          "relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-md",
        )}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative h-6 w-20 shrink-0">
              <Image
                src="/brand/caleno logo/caleno_logo_new.png"
                alt=""
                fill
                className="object-contain object-left"
              />
            </div>
            <span className="font-semibold text-[#0F172A]">Caleno</span>
          </div>
          <div className="hidden w-72 items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-sm sm:flex">
            <Search className="h-4 w-4 text-[#64748B]" />
            <span className="text-[#64748B]">חיפוש תורים, לקוחות...</span>
          </div>
          <div className="h-7 w-7 rounded-full bg-[#E2E8F0]" aria-hidden />
        </div>

        {/* Stat cards row */}
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
          <StatCard
            title="יומן תורים"
            value="—"
            icon={Calendar}
            iconClass="bg-amber-100 text-amber-600"
          />
          <StatCard
            title="לקוחות"
            value="—"
            icon={Users}
            iconClass="bg-sky-100 text-sky-600"
          />
          <StatCard
            title="אתר העסק"
            value="—"
            icon={Globe}
            iconClass="bg-emerald-100 text-emerald-600"
          />
        </div>
      </div>
    </section>
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
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
      <div className="mb-2 inline-flex items-center gap-2">
        <div
          className={cn(
            "grid h-6 w-6 place-items-center rounded-md",
            iconClass || "bg-rose-100 text-rose-600",
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
