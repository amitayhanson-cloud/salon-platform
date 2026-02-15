"use client";

import { useMemo } from "react";
import {
  getDayScheduleGeometry,
  computeBlockPosition,
  timeToTopPx,
  getMinutesSinceStartOfDay,
} from "@/lib/calendarUtils";
import { useElementSize } from "@/hooks/useElementSize";
import { getBookingDisplayInfo } from "@/lib/bookingDisplay";
import { getDisplayStatus, getDisplayStatusKey } from "@/lib/bookingRootStatus";
import { isBookingCancelled } from "@/lib/normalizeBooking";
import { getTextColorHex } from "@/lib/colorUtils";
import StatusDot from "@/components/StatusDot";
import DayScheduleLayout from "./DayScheduleLayout";
import { bookingToBlock, type RenderBlock } from "./MultiWorkerScheduleView";

/** Same block source as MultiWorkerScheduleView so phase 2 timing is correct in both views. */
const PHASE2_DEBUG_RENDER = false;
/** Set true to log block position to console. Default off. */
const DEBUG_BLOCK_POSITION = false;

interface Booking {
  id: string;
  date: string;
  time: string;
  durationMin: number;
  serviceName: string;
  serviceType?: string;
  serviceCategory?: string;
  serviceColor?: string | null;
  customerName: string;
  customerPhone: string;
  clientName?: string;
  phone?: string;
  workerId: string | null;
  workerName?: string;
  status: "confirmed" | "cancelled" | "active";
  note?: string;
  createdAt: string;
  start?: Date | { toDate: () => Date } | null;
  end?: Date | { toDate: () => Date } | null;
  startAt?: Date | { toDate: () => Date } | null;
  endAt?: Date | { toDate: () => Date } | null;
  phases?: Array<{
    kind: string;
    startAt: { toDate: () => Date };
    endAt: { toDate: () => Date };
    durationMin: number;
    workerId?: string | null;
    workerName?: string | null;
    serviceName?: string;
    serviceColor?: string;
  }>;
  phase?: 1 | 2;
  parentBookingId?: string | null;
  waitMin?: number;
  waitMinutes?: number;
}

export type BreakRange = { start: string; end: string };

interface DayScheduleViewProps {
  date: string; // YYYY-MM-DD
  bookings: Booking[];
  selectedWorkerId: string; // single worker filter: only events for this worker
  startHour?: number;
  endHour?: number;
  /** Break ranges to show as greyed-out blocks (business-level breaks). */
  breaks?: BreakRange[];
  onBookingClick?: (booking: Booking) => void;
}

/**
 * Timeline view for a single day with 15-minute marks
 * Block position: minutesFromDayStart (from timestamps) and durationMinutes; topPx = minutesFromViewStart * pxPerMinute.
 */
export default function DayScheduleView({
  date,
  bookings,
  selectedWorkerId,
  startHour = 8,
  endHour = 20,
  breaks,
  onBookingClick,
}: DayScheduleViewProps) {
  const [timelineRef, timelineSize] = useElementSize<HTMLDivElement>();
  const geometry = useMemo(
    () => getDayScheduleGeometry(startHour, endHour),
    [startHour, endHour]
  );
  const { timeSlots, totalHeightPx, viewStartMinutes, viewEndMinutes, pxPerMin } = geometry;
  const totalHeight = totalHeightPx;

  const confirmedBookings = useMemo(() => bookings.filter((b) => !isBookingCancelled(b)), [bookings]);

  const allBlocks = useMemo(() => {
    return confirmedBookings
      .map((b) => bookingToBlock(b as Parameters<typeof bookingToBlock>[0], confirmedBookings))
      .filter((b): b is RenderBlock => b !== null);
  }, [confirmedBookings]);

  const blocksForWorker = useMemo(
    () => allBlocks.filter((b) => b.workerId === selectedWorkerId),
    [allBlocks, selectedWorkerId]
  );

  type PhaseBlock = RenderBlock & { top: number; height: number; startMinutes: number; duration: number };

  const bookingBlocks = useMemo((): PhaseBlock[] => {
    const dateISO = date;
    return blocksForWorker
      .map((block) => {
        const pos = computeBlockPosition({
          dateISO,
          start: block.startAt,
          end: block.endAt,
          dayStartMinutes: viewStartMinutes,
          viewEndMinutes,
          slotMinutes: geometry.slotMinutes,
          pxPerMinute: pxPerMin,
        });
        if (!pos) return null;
        if (DEBUG_BLOCK_POSITION) {
          const fmt = (d: Date) => `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
          const s = block.startAt as Date;
          const e = block.endAt as Date;
          console.debug("[DEBUG_BLOCK_POSITION]", {
            bookingId: block.bookingId,
            phase: block.phase,
            rawStartAt_endAt: { start: block.startAt, end: block.endAt },
            parsedDate: { start: fmt(s), end: fmt(e) },
            timestampMs: { startMs: s.getTime(), endMs: e.getTime() },
            minutesFromDayStart: pos.minutesFromDayStart,
            durationMinutes: pos.durationMinutes,
            topPx: pos.topPx,
            heightPx: pos.heightPx,
            dateISO,
            dayStartMinutes: viewStartMinutes,
            slotMinutes: geometry.slotMinutes,
            pxPerMinute: pxPerMin,
          });
        }
        if (PHASE2_DEBUG_RENDER && block.phase === 2) {
          console.debug("[PHASE2_DEBUG_RENDER]", block.bookingId, block.phase, block.startAt.toISOString(), block.endAt.toISOString());
        }
        return {
          ...block,
          top: pos.topPx,
          height: pos.heightPx,
          startMinutes: pos.minutesFromDayStart,
          duration: pos.durationMinutes,
        } as PhaseBlock;
      })
      .filter((b): b is PhaseBlock => b !== null);
  }, [blocksForWorker, date, viewStartMinutes, viewEndMinutes]);

  const getOverlapColumns = (blocks: PhaseBlock[]) => {
    const columns: PhaseBlock[][] = [];
    blocks.forEach((block) => {
      let placed = false;
      for (const column of columns) {
        const hasOverlap = column.some((existing) => {
          const existingEnd = existing.startMinutes + existing.duration;
          const blockEnd = block.startMinutes + block.duration;
          return !(block.startMinutes >= existingEnd || blockEnd <= existing.startMinutes);
        });
        if (!hasOverlap) {
          column.push(block);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([block]);
    });
    return columns;
  };

  // Only render timeline when we have a valid height measurement
  const hasValidHeight = timelineSize.height > 0;

  // Time labels: same pxPerMinute as blocks
  const timeColumn = hasValidHeight ? (
    <div
      className="relative"
      style={{
        height: `${totalHeight}px`,
        paddingTop: 0,
        paddingBottom: 0,
        margin: 0,
      }}
    >
      {Array.from({ length: endHour - startHour + 1 }, (_, hourOffset) => {
        const hour = startHour + hourOffset;
        const hourLabel = `${hour.toString().padStart(2, "0")}:00`;
        const hourTop = timeToTopPx(hourLabel, viewStartMinutes, pxPerMin);
        const labels = [
          <div
            key={hourLabel}
            className="absolute text-xs text-slate-600 pr-2"
            style={{
              top: `${hourTop}px`,
              lineHeight: "1",
              display: "block",
              fontWeight: "600",
              margin: 0,
              padding: 0,
            }}
          >
            {hourLabel}
          </div>,
        ];
        [15, 30, 45].forEach((minute) => {
          const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          const top = timeToTopPx(timeStr, viewStartMinutes, pxPerMin);
          labels.push(
            <div
              key={`${hour}-${minute}`}
              className="absolute text-xs text-slate-500 pr-2"
              style={{
                top: `${top}px`,
                lineHeight: "1",
                display: "block",
                fontWeight: "400",
                fontSize: "10px",
                margin: 0,
                padding: 0,
              }}
            >
              {minute}
            </div>
          );
        });
        return labels;
      })}
    </div>
  ) : null;

  const renderBookingBlock = (block: PhaseBlock) => {
    const booking = bookings.find((b) => b.id === block.bookingId);
    const backgroundColor = block.color ?? "#3B82F6";
    const textColor = getTextColorHex(backgroundColor);
    const phaseLabel = block.isSecondary ? " — שלב 2" : " — שלב 1";
    const displayLabel = `${block.clientName} — ${block.serviceName}`;
    const statusKey = booking ? getDisplayStatusKey(booking as Parameters<typeof getDisplayStatusKey>[0], bookings as Parameters<typeof getDisplayStatusKey>[1]) : null;
    const statusLabel = booking ? getDisplayStatus(booking as Parameters<typeof getDisplayStatus>[0], bookings as Parameters<typeof getDisplayStatus>[1]).label : null;
    const hasNote = Boolean((block.notes ?? "").trim());

    return (
      <div
        key={block.id}
        className="absolute relative rounded-lg overflow-hidden cursor-pointer shadow-sm transition-shadow hover:shadow-md"
        style={{
          top: `${block.top}px`,
          height: `${block.height}px`,
          width: "calc(100% - 4px)",
          zIndex: 20,
          backgroundColor,
          border: block.isSecondary ? "2px dashed rgba(255,255,255,0.6)" : undefined,
          opacity: block.isSecondary ? 0.92 : 1,
        }}
        title={booking ? getBookingDisplayInfo(booking).fullTooltip + phaseLabel : displayLabel}
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
              zIndex: 21,
            }}
            aria-label="Has note"
            title="יש הערה"
          />
        )}
        <div
          className="absolute inset-0 z-10 flex items-center justify-end px-3 py-1"
          style={{
            color: textColor,
            ...(hasNote ? { paddingLeft: "clamp(14px, 24%, 18px)" } : {}),
          }}
        >
          <div dir="rtl" className="min-w-0 w-full text-right overflow-hidden flex flex-col gap-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {block.isSecondary && (
                <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)", color: textColor }}>
                  2
                </span>
              )}
              {statusKey && <StatusDot statusKey={statusKey} title={statusLabel ?? undefined} />}
              <span className="font-semibold truncate">{block.clientName}</span>
              <span className="truncate"> — {block.serviceName}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render schedule area content (single worker only)
  const renderScheduleArea = () => {
    if (!hasValidHeight) return null;

    // Single worker mode: render single column with overlap handling
    const columns = getOverlapColumns(bookingBlocks);
    const columnWidth = columns.length > 0 ? `${100 / Math.max(columns.length, 1)}%` : "100%";

    return (
      <div
        className="relative"
        style={{
          height: `${totalHeight}px`,
          width: "100%",
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        {/* Grid lines: same formula as time bar and blocks (timeToTopPx) */}
        {timeSlots.map((time) => {
          const top = timeToTopPx(time, viewStartMinutes, pxPerMin);
          return (
            <div
              key={time}
              className="absolute left-0 right-0 border-t border-slate-200"
              style={{
                top: `${top}px`,
                margin: 0,
                zIndex: 0,
              }}
            />
          );
        })}

        {/* Break blocks: greyed-out, non-clickable (z-index: 5, below bookings) */}
        {breaks?.map((br, idx) => {
          const startMin = getMinutesSinceStartOfDay(br.start);
          const endMin = getMinutesSinceStartOfDay(br.end);
          if (endMin <= startMin) return null;
          const topPx = (startMin - viewStartMinutes) * pxPerMin;
          const heightPx = (endMin - startMin) * pxPerMin;
          const topClamped = Math.max(0, topPx);
          const heightClamped = Math.min(heightPx, totalHeight - topClamped);
          if (heightClamped <= 0) return null;
          return (
            <div
              key={idx}
              className="absolute left-0 right-0 pointer-events-none opacity-60"
              style={{
                top: `${topClamped}px`,
                height: `${heightClamped}px`,
                background: "repeating-linear-gradient(-45deg, #e2e8f0, #e2e8f0 4px, #cbd5e1 4px, #cbd5e1 8px)",
                zIndex: 5,
              }}
              title="הפסקה"
              aria-hidden
            />
          );
        })}

        {/* Bookings layer - above grid lines (z-index: 10) */}
        {columns.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
            <p className="text-sm text-slate-500">אין תורים ליום זה</p>
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            {columns.map((column, colIndex) => (
              <div
                key={colIndex}
                className="absolute top-0"
                style={{
                  left: `${(colIndex / columns.length) * 100}%`,
                  width: columnWidth,
                  height: `${totalHeight}px`,
                  paddingLeft: colIndex > 0 ? "2px" : "0",
                  paddingRight: colIndex < columns.length - 1 ? "2px" : "0",
                  pointerEvents: "auto",
                }}
              >
                {column.map(renderBookingBlock)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={timelineRef}
      className="relative w-full h-full"
      style={{ height: "100%" }}
    >
      <DayScheduleLayout
        timeColumn={timeColumn}
        scheduleArea={renderScheduleArea()}
        contentHeight={totalHeight}
      />
    </div>
  );
}
