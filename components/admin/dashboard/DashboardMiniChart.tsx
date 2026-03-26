"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, SVGProps } from "react";
import Box from "@mui/material/Box";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import type { BarProps } from "@mui/x-charts/BarChart";
import { useAnimateBar } from "@mui/x-charts/hooks/animation";
import { useDrawingArea, useXAxes } from "@mui/x-charts/hooks";
import { cn } from "@/lib/utils";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";
import type { ChartGranularity } from "@/lib/fetchDashboardWeeklySeries";

const IL_TZ = "Asia/Jerusalem";

/** Placeholder when a bucket has no value (future day / null) — keeps header height stable. */
const EM_DASH = "\u2014";

/** Round `x` up to a readable axis ceiling (1–2–5 × 10ⁿ). */
function niceCeil(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/** Bar charts should anchor at zero; avoid degenerate domains when all values are 0 (currency / continuous). */
function barChartYDomainLimit(dataMin: number, dataMax: number): { min: number; max: number } {
  const peak = Math.max(0, dataMin, dataMax);
  if (peak <= 0) return { min: 0, max: 1 };
  const max = niceCeil(peak * 1.08);
  return { min: 0, max: Math.max(max, peak) };
}

/**
 * Whole-number Y ticks so bar tops align with grid lines. Sparse steps when the range is large.
 * Uses an explicit `tickInterval` array so horizontal grid lines match axis labels (no “ghost” lines).
 */
function buildCountAxisTicks(axisMax: number): number[] {
  if (axisMax <= 0) return [0, 1];
  if (axisMax <= 12) {
    return Array.from({ length: axisMax + 1 }, (_, i) => i);
  }
  const rough = axisMax / 6;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(factor * magnitude));
  const ticks: number[] = [0];
  for (let v = step; v < axisMax; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== axisMax) ticks.push(axisMax);
  return ticks;
}

export type DashboardChartYValueKind = "count" | "percent" | "currency";

const COLOR_BOOKINGS_PAST = "#1e6f7c";
const COLOR_BOOKINGS_FUTURE = "#9dc5cf";

/** Slightly lift a bar fill so the “today” column reads as highlighted (band-style cue). */
function todayBandColor(base: string, dataIndex: number, todayIdx: number | undefined): string {
  if (todayIdx == null || todayIdx < 0 || dataIndex !== todayIdx) return base;
  return `color-mix(in srgb, ${base} 84%, white)`;
}

/** Same stacking/animation as MUI `AnimatedBarElement`; column frame shows “today” (works when bar height is 0). */
function makeTodayOutlineBar(todayIdx: number | undefined) {
  function TodayOutlineBar(props: BarProps) {
    const { ownerState, skipAnimation, id, dataIndex, xOrigin, yOrigin, ...other } = props;
    void skipAnimation;
    void id;
    void xOrigin;
    void yOrigin;
    const animatedProps = useAnimateBar(props);
    const isToday = todayIdx != null && dataIndex === todayIdx;
    const o = other as SVGProps<SVGRectElement> & { stroke?: string; strokeWidth?: number };
    return (
      <rect
        {...o}
        filter={ownerState.isHighlighted ? "brightness(120%)" : undefined}
        opacity={ownerState.isFaded ? 0.3 : 1}
        data-highlighted={ownerState.isHighlighted || undefined}
        data-faded={ownerState.isFaded || undefined}
        {...animatedProps}
        stroke={o.stroke ?? "none"}
        strokeWidth={o.strokeWidth ?? 0}
        style={{
          ...((typeof o.style === "object" && o.style) as CSSProperties | undefined),
        }}
      />
    );
  }
  TodayOutlineBar.displayName = "TodayOutlineBar";
  return TodayOutlineBar;
}

/** Caleno teal (#1e6f7c) — soft slot cue, not a heavy frame */
const TODAY_SLOT_STROKE = "rgba(30, 111, 124, 0.38)";
const TODAY_SLOT_FILL = "rgba(30, 111, 124, 0.045)";

/**
 * Rounded frame around the x-axis band for Israel “today”, full plot height (must render inside BarChart context).
 */
function TodayColumnFrame({ bandCategory }: { bandCategory: string | undefined }) {
  const { top, height } = useDrawingArea();
  const { xAxis, xAxisIds } = useXAxes();
  const xScale = xAxisIds.length > 0 ? xAxis[xAxisIds[0]]?.scale : undefined;

  if (bandCategory == null || xScale == null || height <= 0) return null;

  type BandScale = ((v: string) => number) & { bandwidth: () => number; step: () => number };
  const xs = xScale as BandScale;
  if (typeof xs.bandwidth !== "function" || typeof xs.step !== "function") return null;

  const xCenter = xs(bandCategory);
  if (!Number.isFinite(xCenter)) return null;

  const step = xs.step();
  const bw = xs.bandwidth();
  const leftEdge = xCenter - (step - bw) / 2;
  const inset = Math.max(1, Math.min(3, step * 0.06));
  const x = leftEdge + inset;
  const w = Math.max(0, step - inset * 2);
  const ry = Math.min(8, Math.max(3, bw * 0.12));

  return (
    <rect
      x={x}
      y={top}
      width={w}
      height={height}
      rx={ry}
      ry={ry}
      fill={TODAY_SLOT_FILL}
      stroke={TODAY_SLOT_STROKE}
      strokeWidth={1.25}
      vectorEffect="nonScalingStroke"
      pointerEvents="none"
      style={{ paintOrder: "stroke fill" }}
    />
  );
}

const chartTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1e6f7c" },
  },
  typography: {
    fontFamily: "inherit",
  },
});

export type BookingsStackedSlice = {
  past: (number | null)[];
  future: (number | null)[];
};

type Props = {
  data: (number | null)[];
  className?: string;
  /** y-axis tick + mark label format */
  formatY?: (n: number) => string;
  /** @deprecated Unused with MUI BarChart; kept for call-site compatibility */
  strokeClassName?: string;
  /** One label per data point (week/month/year buckets) — drives the x-axis */
  xLabels?: string[];
  /** When length matches data, top row uses this (e.g. Hebrew date); x-axis still uses xLabels */
  titleLabels?: string[];
  /** Bookings: stacked past (dark) + future (light) per day */
  bookingsStacked?: BookingsStackedSlice;
  /** X-axis index for Israel “today”; bars at this index get a subtle fill lift. */
  todayHighlightIndex?: number;
  /** When set with matching `calendarBucketIds`, “today” follows the browser clock (Israel). */
  timeGranularity?: ChartGranularity;
  /** Same length as `data`: YYYY-MM-DD (week/month) or YYYY-MM (year). */
  calendarBucketIds?: string[];
  /**
   * How the Y axis should scale. `count` = integers + matching grid; `percent` = utilization-style 0–100+;
   * `currency` = revenue (nice continuous ticks).
   */
  yValueKind?: DashboardChartYValueKind;
};

function nullToZero(n: number | null | undefined): number {
  return n == null ? 0 : n;
}

export function DashboardMiniChart({
  data,
  className,
  formatY,
  xLabels,
  titleLabels,
  bookingsStacked,
  todayHighlightIndex,
  timeGranularity = "week",
  calendarBucketIds,
  yValueKind = "count",
}: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<{ seriesId: string | number; dataIndex: number } | null>(null);

  const { seriesData, axisLabels } = useMemo(() => {
    const n = data.length;
    if (n === 0) return { seriesData: [] as (number | null)[], axisLabels: [] as string[] };
    const labels =
      xLabels && xLabels.length === n
        ? xLabels
        : Array.from({ length: n }, (_, i) => String(i + 1));
    return { seriesData: [...data], axisLabels: labels };
  }, [data, xLabels]);

  const useStackedBookings =
    !!bookingsStacked &&
    bookingsStacked.past.length === seriesData.length &&
    bookingsStacked.future.length === seriesData.length;

  const isWeekStrip = axisLabels.length === 7;
  const tiltXLabels = useMemo(
    () => !isWeekStrip && axisLabels.some((l) => l.length > 10),
    [axisLabels, isWeekStrip]
  );
  const timelineStep = useMemo(() => {
    const n = axisLabels.length;
    if (n <= 8) return 1;
    if (n <= 12) return 2;
    if (n <= 30) return 5;
    return 6;
  }, [axisLabels.length]);

  const defaultActiveIndex = useMemo(() => {
    for (let i = seriesData.length - 1; i >= 0; i--) {
      if (useStackedBookings && bookingsStacked) {
        const t = nullToZero(bookingsStacked.past[i]) + nullToZero(bookingsStacked.future[i]);
        if (t > 0) return i;
      } else if (seriesData[i] != null) return i;
    }
    return Math.max(0, seriesData.length - 1);
  }, [seriesData, useStackedBookings, bookingsStacked]);

  /** Align header + tint with Israel “today” on the client so stale SWR / null-future series don’t pin on yesterday. */
  const highlightIdx = useMemo(() => {
    const n = seriesData.length;
    if (n === 0) return undefined;
    if (calendarBucketIds && calendarBucketIds.length === n) {
      const ilYmd = getDateYMDInTimezone(new Date(), IL_TZ);
      if (timeGranularity === "year") {
        const ym = ilYmd.slice(0, 7);
        const yi = calendarBucketIds.indexOf(ym);
        if (yi >= 0) return yi;
      } else {
        const di = calendarBucketIds.indexOf(ilYmd);
        if (di >= 0) return di;
      }
    }
    if (todayHighlightIndex != null && todayHighlightIndex >= 0 && todayHighlightIndex < n) {
      return todayHighlightIndex;
    }
    return undefined;
  }, [calendarBucketIds, seriesData.length, timeGranularity, todayHighlightIndex]);

  const barSlot = useMemo(() => makeTodayOutlineBar(highlightIdx), [highlightIdx]);

  const dataPeak = useMemo(() => {
    const n = seriesData.length;
    if (n === 0) return 0;
    if (useStackedBookings && bookingsStacked) {
      let m = 0;
      for (let i = 0; i < n; i++) {
        m = Math.max(m, nullToZero(bookingsStacked.past[i]) + nullToZero(bookingsStacked.future[i]));
      }
      return m;
    }
    let m = 0;
    for (let i = 0; i < n; i++) {
      const v = seriesData[i];
      if (v != null) m = Math.max(m, v);
    }
    return m;
  }, [seriesData, useStackedBookings, bookingsStacked]);

  const yAxisConfig = useMemo(() => {
    const valueFormatter = (v: number | null) =>
      v == null ? "" : formatY ? formatY(Number(v)) : String(v);
    const base = {
      width: 52,
      valueFormatter,
      tickLabelStyle: { fontSize: 10 } as const,
      tickLabelInterval: "auto" as const,
    };

    if (yValueKind === "count") {
      const axisMax = dataPeak <= 0 ? 1 : Math.max(1, Math.ceil(dataPeak) + 1);
      return {
        ...base,
        min: 0,
        max: axisMax,
        tickInterval: buildCountAxisTicks(axisMax) as unknown[],
      };
    }

    if (yValueKind === "percent") {
      const axisMax = dataPeak <= 0 ? 100 : Math.max(100, Math.ceil(dataPeak / 10) * 10);
      const tickInterval = Array.from({ length: axisMax / 10 + 1 }, (_, i) => i * 10);
      return {
        ...base,
        min: 0,
        max: axisMax,
        tickInterval: tickInterval as unknown[],
      };
    }

    return {
      ...base,
      min: 0,
      domainLimit: barChartYDomainLimit,
    };
  }, [dataPeak, formatY, yValueKind]);

  const activeIndex =
    hoveredIndex != null ? hoveredIndex : highlightIdx != null ? highlightIdx : defaultActiveIndex;
  const titleLine =
    titleLabels &&
    titleLabels.length === seriesData.length &&
    titleLabels[activeIndex] !== undefined
      ? titleLabels[activeIndex]!
      : axisLabels[activeIndex] ?? "";

  const activeValue = seriesData[activeIndex];
  const activeTotalNum = useStackedBookings
    ? nullToZero(bookingsStacked!.past[activeIndex]) + nullToZero(bookingsStacked!.future[activeIndex])
    : activeValue ?? null;
  const activeText =
    activeTotalNum == null
      ? EM_DASH
      : formatY
        ? formatY(Number(activeTotalNum))
        : String(activeTotalNum);

  if (seriesData.length === 0) {
    return (
      <div className={cn("flex h-[100px] items-center justify-center text-xs text-slate-400", className)}>
        אין נתונים להצגה
      </div>
    );
  }

  const formatCell = (v: number | null) => (v == null ? EM_DASH : formatY ? formatY(v) : String(v));

  const singleSeries = [
    {
      id: "stat",
      data: seriesData,
      label: "",
      color: COLOR_BOOKINGS_PAST,
      colorGetter: ({ dataIndex }: { dataIndex: number }) =>
        todayBandColor(COLOR_BOOKINGS_PAST, dataIndex, highlightIdx),
      valueFormatter: (v: number | null) => formatCell(v),
      highlightScope: { highlight: "item" as const, fade: "none" as const },
    },
  ];

  const stackedSeries =
    useStackedBookings && bookingsStacked
      ? [
          {
            id: "bookingsPast",
            data: bookingsStacked.past.map(nullToZero),
            stack: "bookings",
            label: "תורים (עבר / היום)",
            color: COLOR_BOOKINGS_PAST,
            colorGetter: ({ dataIndex }: { dataIndex: number }) =>
              todayBandColor(COLOR_BOOKINGS_PAST, dataIndex, highlightIdx),
            valueFormatter: (v: number | null) => formatCell(v),
            highlightScope: { highlight: "item" as const, fade: "none" as const },
          },
          {
            id: "bookingsFuture",
            data: bookingsStacked.future.map(nullToZero),
            stack: "bookings",
            label: "תורים (עתיד)",
            color: COLOR_BOOKINGS_FUTURE,
            colorGetter: ({ dataIndex }: { dataIndex: number }) =>
              todayBandColor(COLOR_BOOKINGS_FUTURE, dataIndex, highlightIdx),
            valueFormatter: (v: number | null) => formatCell(v),
            highlightScope: { highlight: "item" as const, fade: "none" as const },
          },
        ]
      : null;

  return (
    <ThemeProvider theme={chartTheme}>
      <Box
        className={cn("w-full", className)}
        dir="ltr"
        sx={{
          height: 320,
          "& .MuiChartsAxis-tickLabel": {
            fontSize: isWeekStrip ? 11 : 10,
            fill: "rgba(15, 23, 42, 0.72)",
            fontWeight: isWeekStrip ? 500 : 400,
          },
          "& .MuiChartsAxis-line": { stroke: "rgba(226, 232, 240, 0.95)" },
          "& .MuiChartsAxis-tick": { stroke: "rgba(226, 232, 240, 0.95)" },
          "& rect[data-highlighted]": {
            filter: "brightness(1.38) saturate(1.06) !important",
            opacity: "1 !important",
          },
          "& rect[data-faded]": {
            opacity: "1 !important",
            filter: "none !important",
          },
        }}
      >
        <div className="mb-1 text-center">
          <p className="text-xs font-semibold text-slate-600">{titleLine}</p>
          <p
            className={cn(
              "flex min-h-[2rem] items-center justify-center text-xl font-bold tracking-tight tabular-nums",
              activeTotalNum == null ? "text-slate-400" : "text-[#1e6f7c]"
            )}
          >
            {activeText}
          </p>
        </div>
        <BarChart
          height={300}
          margin={{
            top: 16,
            right: 12,
            bottom: tiltXLabels ? 56 : isWeekStrip ? 48 : 44,
            left: 12,
          }}
          renderer="svg-single"
          slots={{ bar: barSlot }}
          hideLegend={!useStackedBookings}
          colors={useStackedBookings ? [COLOR_BOOKINGS_PAST, COLOR_BOOKINGS_FUTURE] : [COLOR_BOOKINGS_PAST]}
          grid={{ vertical: true, horizontal: true }}
          highlightedItem={highlightedItem}
          axisHighlight={{ x: "band", y: "none" }}
          onHighlightedAxisChange={(axisItems) => {
            if (!axisItems || axisItems.length === 0) {
              setHoveredIndex(null);
              setHighlightedItem(null);
              return;
            }
            const item = axisItems[0];
            if (item && typeof item.dataIndex === "number") {
              const idx = item.dataIndex;
              setHoveredIndex(idx);
              // Axis fires on every move; it always targeted "past" and overwrote highlight when hovering the
              // future (light) stack segment — keep that segment highlighted while pointer stays in the band.
              setHighlightedItem((prev) => {
                if (!useStackedBookings || !bookingsStacked) {
                  return { seriesId: "stat", dataIndex: idx };
                }
                if (prev?.dataIndex === idx && prev.seriesId === "bookingsFuture") {
                  return prev;
                }
                const past = nullToZero(bookingsStacked.past[idx]);
                const future = nullToZero(bookingsStacked.future[idx]);
                const anchor: "bookingsPast" | "bookingsFuture" =
                  past <= 0 && future > 0 ? "bookingsFuture" : "bookingsPast";
                return { seriesId: anchor, dataIndex: idx };
              });
            }
          }}
          onHighlightChange={(item) => {
            // Bar segments call clearHighlight on pointer-leave even when the cursor is still in the same
            // x band (empty area above short bars). Ignoring null keeps slot hover driven by the axis listener.
            if (!item || typeof item.dataIndex !== "number") {
              return;
            }
            setHoveredIndex(item.dataIndex);
            setHighlightedItem({ seriesId: item.seriesId, dataIndex: item.dataIndex });
          }}
          xAxis={[
            {
              scaleType: "band",
              data: axisLabels,
              tickLabelInterval:
                isWeekStrip || axisLabels.length <= 7
                  ? () => true
                  : (_value, index) =>
                      index === 0 || index === axisLabels.length - 1 || index % timelineStep === 0,
              tickLabelStyle: {
                angle: tiltXLabels ? -35 : 0,
                textAnchor: tiltXLabels ? "end" : "middle",
                fontSize: isWeekStrip ? 11 : 10,
              },
            },
          ]}
          yAxis={[yAxisConfig]}
          series={stackedSeries ?? singleSeries}
          slotProps={{
            tooltip: {
              trigger: "axis",
            },
            legend: {
              direction: "horizontal",
              position: { vertical: "top", horizontal: "center" },
            },
          }}
        >
          <TodayColumnFrame
            bandCategory={highlightIdx != null ? axisLabels[highlightIdx] : undefined}
          />
        </BarChart>
      </Box>
    </ThemeProvider>
  );
}
