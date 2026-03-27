"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type Props = {
  values: (number | null)[];
  className?: string;
  /** View box width / height basis */
  width?: number;
  height?: number;
};

/**
 * Tiny SVG line strip for Bento hero tiles (week series from dashboard chart API).
 */
export function StatSparkline({ values, className, width = 128, height = 40 }: Props) {
  const d = useMemo(() => {
    const nums = values.map((v) => (v == null || !Number.isFinite(v) ? 0 : Number(v)));
    if (nums.length === 0) return null;
    if (nums.length === 1) {
      const y = height / 2;
      return { line: `M 0 ${y} L ${width} ${y}`, area: null as string | null };
    }
    const max = Math.max(...nums, 1e-6);
    const min = Math.min(...nums, 0);
    const span = max - min || 1;
    const padX = 2;
    const padY = 4;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const pts: [number, number][] = nums.map((n, i) => {
      const x = padX + (i / (nums.length - 1)) * innerW;
      const y = padY + innerH - ((n - min) / span) * innerH;
      return [x, y];
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area =
      `M ${pts[0][0]} ${height - padY} L ` +
      pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ") +
      ` L ${pts[pts.length - 1][0]} ${height - padY} Z`;
    return { line, area };
  }, [values, width, height]);

  if (!d) {
    return <div className={cn("h-10 w-full max-w-[8rem]", className)} aria-hidden />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 text-teal-600", className)}
      aria-hidden
    >
      {d.area ? (
        <path d={d.area} className="fill-teal-600/10" stroke="none" />
      ) : null}
      <path
        d={d.line}
        fill="none"
        className="stroke-current stroke-[1.75]"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
