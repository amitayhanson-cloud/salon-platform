"use client";

import { useMemo } from "react";
import {
  getDayScheduleGeometry,
  computeBlockPosition,
  timeToTopPx,
} from "@/lib/calendarUtils";
import { useElementSize } from "@/hooks/useElementSize";
import { getBookingDisplayInfo } from "@/lib/bookingDisplay";
import { isBookingCancelled } from "@/lib/normalizeBooking";
import { getTextColorHex } from "@/lib/colorUtils";
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

interface DayScheduleViewProps {
  date: string; // YYYY-MM-DD
  bookings: Booking[];
  selectedWorkerId: string; // single worker filter: only events for this worker
  startHour?: number;
  endHour?: number;
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
    const phaseLabel = block.isSecondary ? " (שלב 2)" : "";
    const displayLabel = `${block.clientName} — ${block.serviceName}${phaseLabel}`;

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
        <div className="absolute inset-0 z-10 flex items-center justify-end px-3" style={{ color: textColor }}>
          <div dir="rtl" className="min-w-0 w-full text-right whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-1">
            {block.isSecondary && (
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)", color: textColor }}>
                2
              </span>
            )}
            <span className="font-semibold">{block.clientName}</span>
            <span> — {block.serviceName}{phaseLabel}</span>
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
