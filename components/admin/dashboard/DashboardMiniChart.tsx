"use client";

import { useMemo, type ComponentType } from "react";
import Box from "@mui/material/Box";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LineChart, type MarkElementProps } from "@mui/x-charts/LineChart";
import { cn } from "@/lib/utils";

const CHART_UP = "#09899b";
const CHART_DOWN = "#c45c5a";

const chartTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1e6f7c" },
  },
  typography: {
    fontFamily: "inherit",
  },
});

type Props = {
  data: number[];
  className?: string;
  /** y-axis tick + mark label format */
  formatY?: (n: number) => string;
  /** @deprecated Unused with MUI LineChart; kept for call-site compatibility */
  strokeClassName?: string;
  /** One label per data point (day / week / month) — drives the x-axis */
  xLabels?: string[];
};

function markFillColor(values: number[], dataIndex: number): string {
  if (dataIndex <= 0) {
    if (values.length <= 1) return CHART_UP;
    return values[1] >= values[0] ? CHART_UP : CHART_DOWN;
  }
  return values[dataIndex] >= values[dataIndex - 1] ? CHART_UP : CHART_DOWN;
}

function createStatMark(
  values: number[],
  formatY: ((n: number) => string) | undefined,
  fontSize: number
): ComponentType<MarkElementProps> {
  function StatMark(props: MarkElementProps) {
    const { x, y, dataIndex, hidden } = props;
    if (hidden) return null;
    const raw = values[dataIndex];
    if (raw == null || Number.isNaN(raw)) return null;

    const nx = typeof x === "number" ? x : Number(x);
    const ny = typeof y === "number" ? y : Number(y);
    const fill = markFillColor(values, dataIndex);
    const text = formatY ? formatY(raw) : String(raw);

    return (
      <g>
        <circle cx={nx} cy={ny} r={4} fill={fill} stroke="#fff" strokeWidth={1.25} />
        <text
          x={nx}
          y={ny - 12}
          textAnchor="middle"
          dominantBaseline="auto"
          fill={fill}
          style={{
            fontWeight: 700,
            fontSize,
          }}
        >
          {text}
        </text>
      </g>
    );
  }
  StatMark.displayName = "StatMark";
  return StatMark;
}

export function DashboardMiniChart({ data, className, formatY, xLabels }: Props) {
  const fontSize = data.length > 8 ? 9 : 11;

  const { seriesData, axisLabels } = useMemo(() => {
    const n = data.length;
    if (n === 0) return { seriesData: [] as number[], axisLabels: [] as string[] };
    const labels =
      xLabels && xLabels.length === n
        ? xLabels
        : Array.from({ length: n }, (_, i) => String(i + 1));
    return { seriesData: [...data], axisLabels: labels };
  }, [data, xLabels]);

  const tiltXLabels = useMemo(() => axisLabels.some((l) => l.length > 6), [axisLabels]);

  const Mark = useMemo(
    () => createStatMark(seriesData, formatY, fontSize),
    [seriesData, formatY, fontSize]
  );

  if (seriesData.length === 0) {
    return (
      <div className={cn("flex h-[100px] items-center justify-center text-xs text-slate-400", className)}>
        אין נתונים להצגה
      </div>
    );
  }

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
        }}
      >
        <LineChart
          height={300}
          margin={{ top: 28, right: 12, bottom: 44, left: 12 }}
          hideLegend
          colors={["#1e6f7c"]}
          grid={{ vertical: true, horizontal: true }}
          xAxis={[
            {
              scaleType: "point",
              data: axisLabels,
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
          series={[
            {
              id: "stat",
              data: seriesData,
              label: "",
              area: true,
              showMark: true,
              curve: "monotoneX",
              valueFormatter: (v) => (v == null ? "" : formatY ? formatY(v) : String(v)),
            },
          ]}
          slotProps={{
            tooltip: {
              trigger: "item",
            },
            line: {
              strokeWidth: 2,
            },
          }}
          slots={{
            mark: Mark,
          }}
        />
      </Box>
    </ThemeProvider>
  );
}
