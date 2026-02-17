"use client";

/**
 * DayGrid: single scroll container with one coordinate system for time labels, slot lines, and booking blocks.
 * - Labels, slot rows, and blocks are all inside the same scrollable grid.
 * - Grid: display: grid, grid-template-rows: repeat(totalRows, SLOT_HEIGHT_PX).
 * - Blocks placed by grid-row from booking startAt/endAt only (no gap/wait logic).
 */

import { useMemo, useRef, useEffect, useState } from "react";
import {
  minutesSinceStartOfDayLocal,
  durationMinutesLocal,
  toLocalDate,
  getMinutesSinceStartOfDay,
} from "@/lib/calendarUtils";
import { getBookingDisplayInfo } from "@/lib/bookingDisplay";
import { isBookingCancelled } from "@/lib/normalizeBooking";
import { getTextColorHex } from "@/lib/colorUtils";
import { getDisplayStatus, getDisplayStatusKey } from "@/lib/bookingRootStatus";
import StatusDot from "@/components/StatusDot";
import { bookingToBlock, type RenderBlock } from "./MultiWorkerScheduleView";

const SLOT_MINUTES = 15;
const SLOT_HEIGHT_PX = 20;
const TIME_COLUMN_WIDTH_PX = 56;

/** Label interval in minutes. Labels generated at DAY_START + n * this. Default 15 (every row). */
const TIME_LABEL_INTERVAL_MINUTES = 15;

/** Below this width (px) use 30-min labels; above use TIME_LABEL_INTERVAL_MINUTES (15). */
const LABEL_INTERVAL_BREAKPOINT_PX = 640;

/** Set true to show 11:30 alignment line and log deltaPx. Default false. */
const DEBUG_CALENDAR_ALIGN = false;

function minutesToHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Returns 15 on desktop, 30 on small screens so labels don't crowd on mobile. */
function useLabelInterval(): number {
  const [interval, setInterval] = useState(TIME_LABEL_INTERVAL_MINUTES);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LABEL_INTERVAL_BREAKPOINT_PX}px)`);
    const update = () => setInterval(mq.matches ? TIME_LABEL_INTERVAL_MINUTES : 30);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return interval;
}

export interface DayGridBlock extends RenderBlock {
  gridRowStart: number;
  gridRowSpan: number;
  workerColumnIndex: number;
}

export interface DayGridProps {
  dateISO: string;
  bookings: Array<{
    id: string;
    workerId: string | null;
    phase?: 1 | 2;
    start?: Date | { toDate: () => Date } | null;
    end?: Date | { toDate: () => Date } | null;
    startAt?: Date | { toDate: () => Date } | null;
    endAt?: Date | { toDate: () => Date } | null;
    durationMin?: number;
    date?: string;
    dateStr?: string;
    time?: string;
    timeHHmm?: string;
    customerName?: string;
    clientName?: string;
    serviceName?: string;
    serviceId?: string;
    serviceType?: string;
    serviceColor?: string | null;
    status?: string;
    whatsappStatus?: string | null;
  }>;
  workers: Array<{ id: string; name: string }>;
  startHour?: number;
  endHour?: number;
  /** Break ranges to show as greyed-out rows (business-level breaks). */
  breaks?: Array<{ start: string; end: string }>;
  /** Per-worker break ranges for the current day (rendered in that worker's column only). */
  workerBreaksByWorkerId?: Record<string, Array<{ start: string; end: string }>>;
  onBookingClick?: (booking: unknown) => void;
}

export default function DayGrid({
  dateISO,
  bookings,
  workers,
  startHour = 8,
  endHour = 20,
  breaks,
  workerBreaksByWorkerId,
  onBookingClick,
}: DayGridProps) {
  const DAY_START_MINUTES = startHour * 60;
  const DAY_END_MINUTES = endHour * 60;
  const totalRows = Math.max(0, (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES);

  const labelIntervalMinutes = useLabelInterval();

  const confirmedBookings = useMemo(
    () => bookings.filter((b) => !isBookingCancelled(b)),
    [bookings]
  );

  const allBlocks = useMemo(() => {
    return confirmedBookings
      .map((b) => {
        const booking = b as unknown;
        const list = confirmedBookings as unknown;
        return bookingToBlock(
          booking as Parameters<typeof bookingToBlock>[0],
          list as Parameters<typeof bookingToBlock>[1]
        );
      })
      .filter((b): b is RenderBlock => b !== null);
  }, [confirmedBookings]);

  const workerIds = useMemo(() => workers.map((w) => w.id), [workers]);
  const unassignedColIndex = useMemo(
    () => workerIds.indexOf("__unassigned__"),
    [workerIds]
  );

  const blocksWithGrid: DayGridBlock[] = useMemo(() => {
    const result: DayGridBlock[] = [];
    for (const block of allBlocks) {
      const start = toLocalDate(block.startAt);
      const end = toLocalDate(block.endAt);
      if (!start || !end) continue;
      const startMin = minutesSinceStartOfDayLocal(dateISO, start);
      const durMin = durationMinutesLocal(start, end);
      if (durMin <= 0) continue;
      if (startMin >= DAY_END_MINUTES) continue;
      if (startMin + durMin <= DAY_START_MINUTES) continue;
      const minutesFromViewStart = Math.max(0, startMin - DAY_START_MINUTES);
      const rowStart = Math.floor(minutesFromViewStart / SLOT_MINUTES) + 1;
      const rowSpan = Math.max(1, Math.ceil(durMin / SLOT_MINUTES));
      let workerCol = workerIds.indexOf(block.workerId);
      if (workerCol === -1 && unassignedColIndex >= 0) workerCol = unassignedColIndex;
      if (workerCol === -1) continue;
      result.push({
        ...block,
        gridRowStart: rowStart,
        gridRowSpan: rowSpan,
        workerColumnIndex: workerCol,
      });
    }
    return result;
  }, [allBlocks, dateISO, DAY_START_MINUTES, DAY_END_MINUTES, workerIds, unassignedColIndex]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const row11_30Ref = useRef<HTMLDivElement>(null);

  const expectedRowIndex1130 = useMemo(() => {
    const row11_30Min = 11 * 60 + 30;
    if (row11_30Min < DAY_START_MINUTES || row11_30Min >= DAY_END_MINUTES) return null;
    return Math.floor((row11_30Min - DAY_START_MINUTES) / SLOT_MINUTES);
  }, [DAY_START_MINUTES, DAY_END_MINUTES]);

  useEffect(() => {
    if (!DEBUG_CALENDAR_ALIGN || expectedRowIndex1130 == null || !row11_30Ref.current || !scrollRef.current) return;
    const expectedTopPx = expectedRowIndex1130 * SLOT_HEIGHT_PX;
    const labelEl = row11_30Ref.current;
    const scrollEl = scrollRef.current;
    const labelRect = labelEl.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const actualLabelOffsetTop = labelRect.top - scrollRect.top + scrollEl.scrollTop;
    const deltaPx = actualLabelOffsetTop - expectedTopPx;
    console.debug("[DEBUG_CALENDAR_ALIGN]", {
      expectedTopPx,
      actualLabelOffsetTop,
      deltaPx,
      rowFor1130: expectedRowIndex1130 + 1,
    });
  }, [DEBUG_CALENDAR_ALIGN, expectedRowIndex1130, blocksWithGrid]);

  const rowFor1130 = expectedRowIndex1130 != null ? expectedRowIndex1130 + 1 : null;

  if (totalRows === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-slate-500 text-sm">
        No time range
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="w-full h-full overflow-y-auto overflow-x-auto"
      style={{ overflowY: "auto", overflowX: "auto" }}
    >
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `${TIME_COLUMN_WIDTH_PX}px repeat(${workers.length}, minmax(140px, 1fr))`,
          gridTemplateRows: `repeat(${totalRows}, ${SLOT_HEIGHT_PX}px)`,
          width: "100%",
          minWidth: `${TIME_COLUMN_WIDTH_PX + workers.length * 140}px`,
        }}
      >
        {/* Time column: one cell per row; label at TIME_LABEL_INTERVAL steps (same row index as grid) */}
        {Array.from({ length: totalRows }, (_, i) => {
          const minutes = DAY_START_MINUTES + i * SLOT_MINUTES;
          const minutesFromStart = i * SLOT_MINUTES;
          const showLabel = minutesFromStart % labelIntervalMinutes === 0;
          const label = showLabel ? minutesToHHmm(minutes) : "";
          const isFullHour = minutes % 60 === 0;
          return (
            <div
              key={`time-${i}`}
              ref={expectedRowIndex1130 === i ? row11_30Ref : undefined}
              className="border-t border-slate-200 bg-slate-50/80 flex items-start justify-end pr-1.5 text-right shrink-0"
              style={{
                gridRow: i + 1,
                gridColumn: 1,
                fontSize: isFullHour ? "12px" : "10px",
                fontWeight: isFullHour ? 600 : 400,
                color: isFullHour ? "rgb(71 85 105)" : "rgb(100 116 139)",
                lineHeight: 1,
                paddingTop: 2,
              }}
            >
              {label}
            </div>
          );
        })}

        {/* Worker lanes: one per worker, spanning all rows; slot lines via border-top on row cells */}
        {workers.map((worker, colIndex) => (
          <div
            key={worker.id}
            className="relative border-l border-slate-200 flex flex-col"
            style={{
              gridRow: `1 / span ${totalRows}`,
              gridColumn: colIndex + 2,
              minHeight: totalRows * SLOT_HEIGHT_PX,
            }}
          >
            {Array.from({ length: totalRows }, (_, i) => (
              <div
                key={`slot-${worker.id}-${i}`}
                className={i === 0 ? "border-t-2 border-slate-300 shrink-0" : "border-t border-slate-200 shrink-0"}
                style={{ height: SLOT_HEIGHT_PX, minHeight: SLOT_HEIGHT_PX }}
              />
            ))}
          </div>
        ))}

        {/* Break blocks: full-width greyed rows (z-index 5, below bookings) */}
        {breaks?.map((br, idx) => {
          const breakStartMin = getMinutesSinceStartOfDay(br.start);
          const breakEndMin = getMinutesSinceStartOfDay(br.end);
          if (breakEndMin <= breakStartMin) return null;
          const startClamped = Math.max(DAY_START_MINUTES, Math.min(DAY_END_MINUTES, breakStartMin));
          const endClamped = Math.max(DAY_START_MINUTES, Math.min(DAY_END_MINUTES, breakEndMin));
          if (endClamped <= startClamped) return null;
          const minutesFromViewStart = startClamped - DAY_START_MINUTES;
          const rowStart = Math.floor(minutesFromViewStart / SLOT_MINUTES) + 1;
          const rowSpan = Math.ceil((endClamped - startClamped) / SLOT_MINUTES);
          return (
            <div
              key={`break-${idx}`}
              className="pointer-events-none opacity-60 col-span-full"
              style={{
                gridRow: `${rowStart} / span ${rowSpan}`,
                gridColumn: "1 / -1",
                background: "repeating-linear-gradient(-45deg, #e2e8f0, #e2e8f0 4px, #cbd5e1 4px, #cbd5e1 8px)",
                zIndex: 5,
              }}
              title="הפסקה"
              aria-hidden
            />
          );
        })}

        {/* Worker break blocks: same style, one per worker column (z-index 5) */}
        {workerBreaksByWorkerId &&
          workers.flatMap((worker, colIndex) => {
            const workerBreaks = workerBreaksByWorkerId[worker.id];
            if (!workerBreaks?.length) return [];
            return workerBreaks.map((br, idx) => {
              const breakStartMin = getMinutesSinceStartOfDay(br.start);
              const breakEndMin = getMinutesSinceStartOfDay(br.end);
              if (breakEndMin <= breakStartMin) return null;
              const startClamped = Math.max(DAY_START_MINUTES, Math.min(DAY_END_MINUTES, breakStartMin));
              const endClamped = Math.max(DAY_START_MINUTES, Math.min(DAY_END_MINUTES, breakEndMin));
              if (endClamped <= startClamped) return null;
              const minutesFromViewStart = startClamped - DAY_START_MINUTES;
              const rowStart = Math.floor(minutesFromViewStart / SLOT_MINUTES) + 1;
              const rowSpan = Math.ceil((endClamped - startClamped) / SLOT_MINUTES);
              return (
                <div
                  key={`worker-break-${worker.id}-${idx}`}
                  className="pointer-events-none opacity-60"
                  style={{
                    gridRow: `${rowStart} / span ${rowSpan}`,
                    gridColumn: colIndex + 2,
                    background: "repeating-linear-gradient(-45deg, #e2e8f0, #e2e8f0 4px, #cbd5e1 4px, #cbd5e1 8px)",
                    zIndex: 5,
                  }}
                  title="הפסקת עובד"
                  aria-hidden
                />
              );
            });
          })}

        {/* Booking blocks: grid-row placed, same coordinate system */}
        {blocksWithGrid.map((block) => {
          const booking = bookings.find((b) => b.id === block.bookingId);
          const backgroundColor = block.color ?? "#3B82F6";
          const textColor = getTextColorHex(backgroundColor);
          const displayLabel = `${block.clientName} — ${block.serviceName}`;
          const statusKey = booking ? getDisplayStatusKey(booking, bookings) : null;
          const statusLabel = booking ? getDisplayStatus(booking, bookings).label : null;
          const hasNote = Boolean((block.notes ?? "").trim());
          return (
            <div
              key={block.id}
              className="relative rounded-lg overflow-hidden cursor-pointer shadow-sm transition-shadow hover:shadow-md flex items-center justify-end px-2 min-h-0"
              style={{
                gridRow: `${block.gridRowStart} / span ${block.gridRowSpan}`,
                gridColumn: block.workerColumnIndex + 2,
                margin: "2px 4px",
                backgroundColor,
                color: textColor,
                zIndex: 10,
                fontSize: "11px",
              }}
              title={booking ? getBookingDisplayInfo(booking as Parameters<typeof getBookingDisplayInfo>[0]).fullTooltip + (block.phase === 2 ? " — שלב 2" : " — שלב 1") : displayLabel}
              onClick={(e) => {
                e.stopPropagation();
                if (booking) onBookingClick?.(booking);
              }}
            >
              {hasNote && (
                <span
                  className="absolute rounded-full bg-red-500 pointer-events-none"
                  style={{
                    top: "clamp(2px, 10%, 6px)",
                    left: "clamp(2px, 10%, 6px)",
                    width: "clamp(8px, 18%, 12px)",
                    height: "clamp(8px, 18%, 12px)",
                    border: "2px solid #fff",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                    zIndex: 11,
                  }}
                  aria-label="Has note"
                  title="יש הערה"
                />
              )}
              <div
                dir="rtl"
                className="min-w-0 w-full text-right overflow-hidden flex flex-col gap-0.5 py-0.5"
                style={hasNote ? { paddingLeft: "clamp(14px, 24%, 18px)" } : undefined}
              >
                <div className="flex items-center gap-1 min-w-0">
                  {block.isSecondary && (
                    <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)", color: textColor }}>
                      2
                    </span>
                  )}
                  {statusKey && (
                    <StatusDot statusKey={statusKey} title={statusLabel ?? undefined} />
                  )}
                  <span className="font-semibold truncate">{block.clientName}</span>
                  <span className="truncate"> — {block.serviceName}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* DEBUG_CALENDAR_ALIGN: red line at 11:30 row */}
        {DEBUG_CALENDAR_ALIGN && rowFor1130 != null && (
          <div
            className="border-t-2 border-red-500 pointer-events-none z-20 flex items-center"
            style={{
              gridRow: rowFor1130,
              gridColumn: `2 / -1`,
            }}
            aria-hidden
          >
            <span className="text-[10px] font-mono text-red-600 bg-white px-1 ml-1">11:30</span>
          </div>
        )}
      </div>
    </div>
  );
}
