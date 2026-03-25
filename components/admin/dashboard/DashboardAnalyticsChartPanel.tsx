"use client";

import { useState } from "react";
import Link from "next/link";
import { PieChart, pieArcLabelClasses } from "@mui/x-charts/PieChart";
import { cn } from "@/lib/utils";
import { DashboardMiniChart, type BookingsStackedSlice } from "@/components/admin/dashboard/DashboardMiniChart";
import { DashboardChartSkeleton } from "@/components/admin/dashboard/DashboardChartSkeleton";
import type { ChartGranularity } from "@/lib/fetchDashboardWeeklySeries";

const GRANULARITY_LABEL: Record<ChartGranularity, string> = {
  week: "שבוע",
  month: "חודש",
  year: "שנה",
};

const RANGE_CAPTION: Record<ChartGranularity, string> = {
  week: "השבוע הנוכחי (ראשון–שבת, לפי ישראל) · מתחת לגרף שמות היום באנגלית",
  month: "החודש הנוכחי (לפי יום) · תורים: נספרים גם לימים עתידיים (עמודה בהירה)",
  year: "12 החודשים האחרונים (לפי חודש)",
};

export type DashboardChartSlices = Record<
  ChartGranularity,
  {
    labels: string[];
    values: (number | null)[];
    titleLabels?: string[];
    /** Bookings chart: past (dark) + future (light) stacked bars */
    bookingsStacked?: BookingsStackedSlice;
  }
>;

type Props = {
  chartSlices: DashboardChartSlices;
  formatChartY?: (n: number) => string;
  detailNote?: string;
  pieData?: { id: string; label: string; value: number; color?: string }[];
  chartSeriesLoading?: boolean;
  href: string;
};

export function DashboardAnalyticsChartPanel({
  chartSlices,
  formatChartY,
  detailNote,
  pieData,
  chartSeriesLoading = false,
  href,
}: Props) {
  const [granularity, setGranularity] = useState<ChartGranularity>("week");
  const slice = chartSlices[granularity];
  const hasPie = !!pieData && pieData.length > 0;

  return (
    <div className="relative rounded-xl bg-[rgba(255,255,255,0.6)] px-2 py-3 ring-1 ring-[#E2E8F0]/80">
      {!hasPie ? (
        <div
          className="absolute left-2 top-2 z-10 flex rounded-lg border border-slate-200/90 bg-white/95 p-0.5 shadow-sm"
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          role="group"
          aria-label="יחידת זמן לגרף"
        >
          {(["week", "month", "year"] as const).map((g) => (
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
      ) : null}

      {!hasPie ? (
        <div className="mb-2 mt-7 space-y-1.5 text-center sm:mt-6">
          <p className="text-[11px] font-medium text-slate-500">{RANGE_CAPTION[granularity]}</p>
          {detailNote ? (
            <p className="text-[10px] leading-snug text-slate-400">{detailNote}</p>
          ) : null}
        </div>
      ) : (
        <div className="mb-2 mt-1 space-y-1.5 text-center">
          <p className="text-[11px] font-medium text-slate-500">חלוקה לפי מקור הגעה</p>
          {detailNote ? (
            <p className="text-[10px] leading-snug text-slate-400">{detailNote}</p>
          ) : null}
        </div>
      )}

      <div className="relative rounded-lg pt-1">
        {chartSeriesLoading && !hasPie ? (
          <DashboardChartSkeleton />
        ) : hasPie ? (
          <PieChart
            height={240}
            hideLegend
            margin={{ right: 10, left: 10, top: 8, bottom: 8 }}
            series={[
              {
                outerRadius: 88,
                innerRadius: 32,
                data: pieData,
                arcLabel: (params) => {
                  const total = pieData.reduce((s, x) => s + x.value, 0) || 1;
                  const percent = (params.value / total) * 100;
                  return percent >= 7 ? `${percent.toFixed(0)}%` : "";
                },
              },
            ]}
            sx={{
              [`& .${pieArcLabelClasses.root}`]: {
                fill: "#ffffff",
                fontSize: 12,
                fontWeight: 700,
              },
            }}
          />
        ) : (
          <DashboardMiniChart
            data={slice.values}
            formatY={formatChartY}
            xLabels={slice.labels}
            titleLabels={slice.titleLabels}
            bookingsStacked={slice.bookingsStacked}
          />
        )}
      </div>
      <div className="mt-3 flex justify-center">
        <Link href={href} className="text-sm font-medium text-[#1e6f7c] underline-offset-2 hover:underline">
          מעבר למסך מלא
        </Link>
      </div>
    </div>
  );
}
