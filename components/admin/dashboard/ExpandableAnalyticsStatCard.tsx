"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardMiniChart } from "@/components/admin/dashboard/DashboardMiniChart";
import type { ChartGranularity } from "@/lib/fetchDashboardWeeklySeries";

const GRANULARITY_LABEL: Record<ChartGranularity, string> = {
  day: "יום",
  week: "שבוע",
  month: "חודש",
};

const RANGE_CAPTION: Record<ChartGranularity, string> = {
  day: "24 השעות האחרונות (לפי שעה)",
  week: "7 הימים האחרונים (לפי יום)",
  month: "30 הימים האחרונים (לפי יום)",
};

export type DashboardChartSlices = Record<
  ChartGranularity,
  { labels: string[]; values: number[] }
>;

type Props = {
  label: string;
  value: number | string | null;
  href: string;
  icon: LucideIcon;
  title?: string;
  chartSlices: DashboardChartSlices;
  formatChartY?: (n: number) => string;
  /** Extra line under range caption (e.g. cancellations caveat) */
  detailNote?: string;
};

export function ExpandableAnalyticsStatCard({
  label,
  value,
  href,
  icon: Icon,
  title,
  chartSlices,
  formatChartY,
  detailNote,
}: Props) {
  const [open, setOpen] = useState(false);
  const [granularity, setGranularity] = useState<ChartGranularity>("week");

  const slice = chartSlices[granularity];

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        "flex flex-col rounded-2xl border border-[#E2E8F0] bg-[rgba(30,111,124,0.06)] transition-shadow duration-200",
        "hover:border-caleno-deep/30 hover:shadow-md",
        open ? "col-span-2 md:col-span-3" : "col-span-1"
      )}
    >
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full min-h-[7.5rem] flex-col rounded-2xl p-4 text-right transition-colors",
          "hover:bg-[rgba(30,111,124,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2"
        )}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2 text-caleno-deep">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(30,111,124,0.12)] text-caleno-deep">
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-snug text-[#0F172A]/80">
              {label}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </div>
        <p className="mt-auto text-2xl font-bold leading-tight text-[#0F172A] tabular-nums">
          {value !== null && value !== undefined ? value : "—"}
        </p>
        <span className="mt-2 text-xs text-slate-500">
          {open ? "לחיצה לסגירת הגרף" : "לחיצה להרחבה וגרף"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="chart"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#E2E8F0] px-4 pb-4 pt-3">
              <div className="relative rounded-xl bg-[rgba(255,255,255,0.6)] px-2 py-3 ring-1 ring-[#E2E8F0]/80">
                <div
                  className="absolute left-2 top-2 z-10 flex rounded-lg border border-slate-200/90 bg-white/95 p-0.5 shadow-sm"
                  dir="ltr"
                  onClick={(e) => e.stopPropagation()}
                  role="group"
                  aria-label="יחידת זמן לגרף"
                >
                  {(["day", "week", "month"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGranularity(g)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-semibold transition-colors sm:px-2.5 sm:text-[11px]",
                        granularity === g
                          ? "bg-[#1e6f7c] text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {GRANULARITY_LABEL[g]}
                    </button>
                  ))}
                </div>

                <p className="mb-2 mt-7 text-center text-[11px] font-medium text-slate-500 sm:mt-6">
                  {RANGE_CAPTION[granularity]}
                </p>
                {detailNote ? (
                  <p className="mb-2 text-center text-[10px] leading-snug text-slate-400">{detailNote}</p>
                ) : null}

                <div className="relative rounded-lg pt-1">
                  <DashboardMiniChart
                    data={slice.values}
                    formatY={formatChartY}
                    xLabels={slice.labels}
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-center">
                <Link
                  href={href}
                  className="text-sm font-medium text-[#1e6f7c] underline-offset-2 hover:underline"
                >
                  מעבר למסך מלא
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
