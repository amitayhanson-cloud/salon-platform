"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { DefaultizedPieValueType } from "@mui/x-charts/models";
import { PieChart, pieArcLabelClasses } from "@mui/x-charts/PieChart";
import { cn } from "@/lib/utils";
import {
  DashboardMiniChart,
  type BookingsStackedSlice,
  type DashboardChartYValueKind,
} from "@/components/admin/dashboard/DashboardMiniChart";
import { DashboardChartSkeleton } from "@/components/admin/dashboard/DashboardChartSkeleton";
import type { ChartGranularity } from "@/lib/fetchDashboardWeeklySeries";

const GRANULARITY_LABEL: Record<ChartGranularity, string> = {
  week: "שבוע",
  month: "חודש",
  year: "שנה",
};

export type DashboardChartSlices = Record<
  ChartGranularity,
  {
    labels: string[];
    values: (number | null)[];
    titleLabels?: string[];
    /** Bookings chart: past (dark) + future (light) stacked bars */
    bookingsStacked?: BookingsStackedSlice;
    /** Israel “today” column on the bar chart x-axis, when in range. */
    todayHighlightIndex?: number;
    /** Per-bar calendar id (see admin `DashboardMetricSlice.xCalendarIds`). */
    xCalendarIds?: string[];
  }
>;

type Props = {
  chartSlices: DashboardChartSlices;
  formatChartY?: (n: number) => string;
  yValueKind?: DashboardChartYValueKind;
  pieData?: TrafficPieDatum[];
  pieEmptyHint?: string;
  pieEmptyActionLabel?: string;
  pieEmptyActionHref?: string;
  chartSeriesLoading?: boolean;
  /** When both are set, week/month/year is controlled by the parent (survives panel remounts). */
  granularity?: ChartGranularity;
  onGranularityChange?: (g: ChartGranularity) => void;
};

export type TrafficPieDatum = { id: string; label: string; value: number; color?: string };

/** מקור הגעה — pie by share of attributed bookings (MUI pattern: % labels from total). */
function TrafficAttributionPieChart({ data }: { data: TrafficPieDatum[] }) {
  const ordered = useMemo(() => [...data].sort((a, b) => b.value - a.value), [data]);
  const total = useMemo(() => ordered.reduce((a, b) => a + b.value, 0) || 1, [ordered]);

  const getArcLabel = useCallback(
    (params: DefaultizedPieValueType) => `${((params.value / total) * 100).toFixed(0)}%\u200E`,
    [total]
  );

  return (
    <PieChart
      width={280}
      height={260}
      hideLegend
      margin={{ top: 8, bottom: 8, left: 8, right: 5 }}
      series={[
        {
          outerRadius: 92,
          data: ordered,
          arcLabel: getArcLabel,
          /** Hide % on hairline slices so labels do not collide */
          arcLabelMinAngle: 12,
        },
      ]}
      sx={{
        [`& .${pieArcLabelClasses.root}`]: {
          fill: "#ffffff",
          fontSize: 14,
          fontWeight: 700,
        },
      }}
    />
  );
}

export function DashboardAnalyticsChartPanel({
  chartSlices,
  formatChartY,
  yValueKind,
  pieData,
  pieEmptyHint,
  pieEmptyActionLabel,
  pieEmptyActionHref,
  chartSeriesLoading = false,
  granularity: granularityProp,
  onGranularityChange,
}: Props) {
  const [internalGranularity, setInternalGranularity] = useState<ChartGranularity>("week");
  const isControlled =
    granularityProp !== undefined && typeof onGranularityChange === "function";
  const granularity = isControlled ? granularityProp! : internalGranularity;
  const setGranularity = (g: ChartGranularity) => {
    if (isControlled) onGranularityChange(g);
    else setInternalGranularity(g);
  };
  const slice = chartSlices[granularity];
  /** Traffic row always passes `pieData` (maybe `[]`); other rows pass `undefined` → bars only. */
  const isTrafficSourcePie = pieData !== undefined;
  const hasPieSlices = !!pieData && pieData.length > 0;

  return (
    <div className="relative min-w-0 rounded-xl bg-[rgba(255,255,255,0.6)] px-2 py-3 ring-1 ring-[#E2E8F0]/80 sm:px-3">
      <div className="relative min-w-0 rounded-lg pb-2 pt-1">
        {isTrafficSourcePie ? (
          chartSeriesLoading && !hasPieSlices ? (
            <DashboardChartSkeleton />
          ) : hasPieSlices ? (
            <div className="flex flex-col items-center gap-3" dir="ltr">
              <TrafficAttributionPieChart data={pieData} />
              <div className="w-full max-w-[360px] space-y-1.5 px-2 pb-1">
                {pieData
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((item) => {
                    const total = pieData.reduce((sum, row) => sum + row.value, 0) || 1;
                    const pct = (item.value / total) * 100;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex min-w-0 items-center gap-2 text-slate-700">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color ?? "#1e6f7c" }}
                            aria-hidden
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-slate-600">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="flex h-[220px] flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-500">
              <p>{pieEmptyHint ?? "אין עדיין נתוני מקור הגעה מספיקים להצגת הגרף"}</p>
              {pieEmptyActionLabel && pieEmptyActionHref ? (
                <Link
                  href={pieEmptyActionHref}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#1e6f7c] hover:bg-slate-50"
                >
                  {pieEmptyActionLabel}
                </Link>
              ) : null}
            </div>
          )
        ) : chartSeriesLoading ? (
          <DashboardChartSkeleton />
        ) : (
          <DashboardMiniChart
            data={slice.values}
            formatY={formatChartY}
            yValueKind={yValueKind}
            xLabels={slice.labels}
            titleLabels={slice.titleLabels}
            bookingsStacked={slice.bookingsStacked}
            todayHighlightIndex={slice.todayHighlightIndex}
            timeGranularity={granularity}
            calendarBucketIds={slice.xCalendarIds}
          />
        )}
      </div>

      {!isTrafficSourcePie ? (
        <div
          className="relative z-20 mt-3 flex justify-center border-t border-[#E2E8F0]/80 pt-3 isolate"
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          role="group"
          aria-label="יחידת זמן לגרף"
        >
          <div className="inline-flex rounded-lg border border-slate-200/90 bg-white/95 p-0.5 shadow-sm">
            {(["week", "month", "year"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors sm:px-3.5 sm:text-xs",
                  granularity === g
                    ? "bg-[#1e6f7c] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {GRANULARITY_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
