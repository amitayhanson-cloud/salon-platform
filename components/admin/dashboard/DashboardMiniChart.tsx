"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { cn } from "@/lib/utils";

/** Placeholder when a bucket has no value (future day / null) — keeps header height stable. */
const EM_DASH = "\u2014";

const COLOR_BOOKINGS_PAST = "#1e6f7c";
const COLOR_BOOKINGS_FUTURE = "#9dc5cf";

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
};

function nullToZero(n: number | null | undefined): number {
  return n == null ? 0 : n;
}

export function DashboardMiniChart({ data, className, formatY, xLabels, titleLabels, bookingsStacked }: Props) {
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
    () => isWeekStrip || axisLabels.some((l) => l.length > 8),
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

  const activeIndex = hoveredIndex != null ? hoveredIndex : defaultActiveIndex;
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
            valueFormatter: (v: number | null) => formatCell(v),
            highlightScope: { highlight: "item" as const, fade: "none" as const },
          },
          {
            id: "bookingsFuture",
            data: bookingsStacked.future.map(nullToZero),
            stack: "bookings",
            label: "תורים (עתיד)",
            color: COLOR_BOOKINGS_FUTURE,
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
            fontSize: 10,
            fill: "rgba(15, 23, 42, 0.55)",
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
          margin={{ top: 16, right: 12, bottom: tiltXLabels ? 56 : 44, left: 12 }}
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
                fontSize: 10,
              },
            },
          ]}
          yAxis={[
            {
              width: 52,
              valueFormatter: (v: number | null) =>
                v == null ? "" : formatY ? formatY(Number(v)) : String(v),
              tickLabelStyle: { fontSize: 10 },
            },
          ]}
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
        />
      </Box>
    </ThemeProvider>
  );
}
