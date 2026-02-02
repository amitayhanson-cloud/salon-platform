"use client";

import { ReactNode } from "react";

const TIME_COL_W = 80; // Fixed width for time column in pixels

interface DayScheduleLayoutProps {
  timeColumn: ReactNode;
  scheduleArea: ReactNode;
  /** When set, both columns use this height and the layout scrolls vertically so grid alignment is preserved. */
  contentHeight?: number;
}

/**
 * Layout component that enforces strict 2-column structure:
 * - Left: Schedule area (timeline + bookings)
 * - Right: Time column (fixed, always visible)
 * When contentHeight is provided, both columns share that height and scroll together.
 */
export default function DayScheduleLayout({
  timeColumn,
  scheduleArea,
  contentHeight,
}: DayScheduleLayoutProps) {
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `1fr ${TIME_COL_W}px`,
    direction: "ltr",
    minHeight: contentHeight ?? "100%",
    height: contentHeight ?? "100%",
  };

  const inner = (
    <div
      className="relative w-full"
      style={gridStyle}
    >
      <div
        className="relative"
        style={{
          gridColumn: "1",
          overflowX: "auto",
          overflowY: "hidden",
          minHeight: contentHeight ?? "100%",
          height: contentHeight ?? "100%",
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        <div className="relative" style={{ height: "100%", paddingTop: 0, paddingBottom: 0 }}>
          {scheduleArea}
        </div>
      </div>
      <div
        className="border-l border-slate-200 bg-slate-50"
        style={{
          gridColumn: "2",
          width: `${TIME_COL_W}px`,
          minHeight: contentHeight ?? "100%",
          height: contentHeight ?? "100%",
          zIndex: 20,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        {timeColumn}
      </div>
    </div>
  );

  if (contentHeight != null) {
    return (
      <div className="relative w-full h-full" style={{ overflow: "auto", height: "100%" }}>
        {inner}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ height: "100%" }}>
      {inner}
    </div>
  );
}

export { TIME_COL_W };
