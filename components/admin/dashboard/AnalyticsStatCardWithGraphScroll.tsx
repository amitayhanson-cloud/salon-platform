"use client";

import Link from "next/link";
import { BarChart3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number | string | null;
  href: string;
  icon: LucideIcon;
  title?: string;
  /** DOM id of the chart section below (e.g. dashboard-chart-clients) */
  chartSectionId: string;
  className?: string;
};

function scrollToChartSection(elementId: string) {
  const el = document.getElementById(elementId);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Dashboard stat tile: main area links to detail; graph button scrolls to matching section on the page.
 */
export function AnalyticsStatCardWithGraphScroll({
  label,
  value,
  href,
  icon: Icon,
  title,
  chartSectionId,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border border-[#E2E8F0] bg-[rgba(30,111,124,0.06)] transition-shadow duration-200",
        "hover:border-caleno-deep/30 hover:shadow-md",
        className
      )}
    >
      <Link
        href={href}
        title={title}
        className={cn(
          "flex min-h-[7.5rem] flex-col rounded-2xl p-4 pl-12 text-right transition-colors",
          "hover:bg-[rgba(30,111,124,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2"
        )}
      >
        <div className="mb-2 flex items-start gap-2 text-caleno-deep">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(30,111,124,0.12)] text-caleno-deep">
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-snug text-[#0F172A]/80">
            {label}
          </span>
        </div>
        <p className="mt-auto text-2xl font-bold leading-tight text-[#0F172A] tabular-nums">
          {value !== null && value !== undefined ? value : "—"}
        </p>
      </Link>
      <button
        type="button"
        onClick={() => scrollToChartSection(chartSectionId)}
        title="מעבר לגרף"
        aria-label={`מעבר לגרף — ${label}`}
        className={cn(
          "absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl",
          "border border-slate-200/90 bg-white/95 text-[#1e6f7c] shadow-sm",
          "transition hover:bg-[rgba(30,111,124,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep"
        )}
      >
        <BarChart3 className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
