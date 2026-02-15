"use client";

/**
 * Print day view as a grid matching the day calendar: time column (left), worker columns, bookings as blocks.
 * Reuses same layout math as DayGrid (slot height, px-per-minute, computeBlockPosition).
 */

import { useMemo } from "react";
import {
  computeBlockPosition,
  toLocalDate,
  SLOT_MINUTES,
  type BookingBlockPosition,
} from "@/lib/calendarUtils";
import { getTextColorHex } from "@/lib/colorUtils";
import { bookingToBlock, type RenderBlock } from "./MultiWorkerScheduleView";
import type { ChemicalCardPrintData } from "./WorkerDayPrintView";

/** Match DayGrid: 20px per 15-min slot. */
const SLOT_HEIGHT_PX = 20;
const TIME_COLUMN_WIDTH_PX = 48;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

function normalizePhone(phone: string): string {
  return phone.replace(/\s|-|\(|\)/g, "");
}

function minutesToHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One-line chemical card summary for block text. */
function chemicalCardSummary(card: ChemicalCardPrintData | null | undefined): string {
  if (!card) return "כרטיס כימי: אין";
  const colors = card.colors ?? [];
  const oxygen = card.oxygen ?? [];
  if (colors.length === 0 && oxygen.length === 0) return "כרטיס כימי: ריק";
  const colorParts = colors.map((c) => [c.colorNumber, c.amount].filter(Boolean).join(" "));
  const oxyParts = oxygen.map((o) => [o.percentage, o.amount].filter(Boolean).join(" "));
  const parts: string[] = [];
  if (colorParts.length) parts.push(`צבע: ${colorParts.join("; ")}`);
  if (oxyParts.length) parts.push(`חמצן: ${oxyParts.join("; ")}`);
  return parts.join(" · ") || "כרטיס כימי";
}

export interface PrintDayGridViewProps {
  siteName: string;
  dayISO: string;
  workers: Array<{ id: string; name: string }>;
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
    customerPhone?: string;
    clientId?: string | null;
    serviceName?: string;
    serviceType?: string;
    serviceId?: string;
    serviceColor?: string | null;
  }>;
  chemicalCardsMap?: Record<string, ChemicalCardPrintData | null>;
  startHour?: number;
  endHour?: number;
}

interface BlockWithPosition extends RenderBlock {
  topPx: number;
  heightPx: number;
  workerColumnIndex: number;
  clientKey: string;
}

export default function PrintDayGridView({
  siteName,
  dayISO,
  workers,
  bookings,
  chemicalCardsMap = {},
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
}: PrintDayGridViewProps) {
  const DAY_START_MINUTES = startHour * 60;
  const DAY_END_MINUTES = endHour * 60;
  const totalRows = Math.max(0, (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES);
  const pxPerMin = SLOT_HEIGHT_PX / SLOT_MINUTES;
  const totalHeightPx = totalRows * SLOT_HEIGHT_PX;

  const workerIds = useMemo(() => workers.map((w) => w.id), [workers]);
  const unassignedId = "__unassigned__";
  const workersWithUnassigned = useMemo(() => {
    const hasUnassigned = bookings.some((b) => !b.workerId || b.workerId.trim() === "");
    if (hasUnassigned) return [...workers, { id: unassignedId, name: "ללא מטפל" }];
    return workers;
  }, [workers, bookings]);
  const workerColumnIds = workersWithUnassigned.map((w) => w.id);

  const blocksWithPosition = useMemo((): BlockWithPosition[] => {
    const result: BlockWithPosition[] = [];
    const bookingList = bookings as Parameters<typeof bookingToBlock>[0][];
    const allBookings = bookings as Parameters<typeof bookingToBlock>[1];
    for (const booking of bookingList) {
      const block = bookingToBlock(booking, allBookings);
      if (!block) continue;
      const start = toLocalDate(block.startAt);
      const end = toLocalDate(block.endAt);
      if (!start || !end) continue;
      const pos: BookingBlockPosition | null = computeBlockPosition({
        dateISO: dayISO,
        start,
        end,
        dayStartMinutes: DAY_START_MINUTES,
        viewEndMinutes: DAY_END_MINUTES,
        slotMinutes: SLOT_MINUTES,
        pxPerMinute: pxPerMin,
      });
      if (!pos) continue;
      let colIndex = workerColumnIds.indexOf(block.workerId);
      if (colIndex === -1 && block.workerId === unassignedId) colIndex = workerColumnIds.indexOf(unassignedId);
      if (colIndex === -1) colIndex = 0;
      const clientKey =
        (booking as { clientId?: string }).clientId?.trim() ||
        normalizePhone((booking as { customerPhone?: string }).customerPhone ?? "");
      result.push({
        ...block,
        topPx: pos.topPx,
        heightPx: pos.heightPx,
        workerColumnIndex: colIndex,
        clientKey,
      });
    }
    return result;
  }, [bookings, dayISO, DAY_START_MINUTES, DAY_END_MINUTES, pxPerMin, workerColumnIds]);

  const dateLabel = useMemo(() => {
    const [y, m, d] = dayISO.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    return `${dayNames[date.getDay()]} ${d}/${m}/${y}`;
  }, [dayISO]);

  return (
    <div className="print-day-grid-root" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .print-day-grid-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-day-grid-root { background: white; margin: 0; padding: 0.5rem; }
          .print-day-grid-root .print-grid-section { break-inside: avoid; page-break-inside: avoid; }
          .print-day-grid-root .print-grid-wrapper { max-width: 100%; }
        }
        @media screen {
          .print-day-grid-root { max-width: 900px; margin: 0 auto; padding: 1rem; background: white; }
        }
        .print-day-grid-root .print-grid-header { margin-bottom: 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid #333; }
        .print-day-grid-root .print-grid-header h1 { font-size: 14pt; margin: 0; }
        .print-day-grid-root .print-grid-header .meta { font-size: 10pt; color: #444; }
        .print-day-grid-root .print-time-cell { font-size: 9pt; color: #444; text-align: right; padding: 0 4px; border-top: 1px solid #e5e7eb; }
        .print-day-grid-root .print-worker-header { font-size: 10pt; font-weight: 600; text-align: center; padding: 4px; border: 1px solid #d1d5db; background: #f9fafb; }
        .print-day-grid-root .print-worker-lane { position: relative; border-left: 1px solid #e5e7eb; min-height: 100%; }
        .print-day-grid-root .print-block { position: absolute; left: 2px; right: 2px; overflow: hidden; border-radius: 4px; padding: 2px 4px; font-size: 9pt; display: flex; flex-direction: column; justify-content: flex-start; }
        .print-day-grid-root .print-block-line2 { font-size: 8pt; opacity: 0.95; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      ` }} />
      <div className="print-grid-header">
        <h1>{siteName}</h1>
        <div className="meta">{dateLabel}</div>
      </div>
      <div
        className="print-grid-wrapper"
        style={{
          display: "grid",
          gridTemplateColumns: `${TIME_COLUMN_WIDTH_PX}px repeat(${workersWithUnassigned.length}, minmax(80px, 1fr))`,
          gridTemplateRows: `auto ${totalHeightPx}px`,
          width: "100%",
          maxWidth: "100%",
        }}
      >
        {/* Row 0: time gutter (empty) + worker headers */}
        <div style={{ gridColumn: 1, gridRow: 1 }} />
        {workersWithUnassigned.map((w, colIndex) => (
          <div key={w.id} className="print-worker-header" style={{ gridColumn: colIndex + 2, gridRow: 1 }}>
            {w.name}
          </div>
        ))}
        {/* Row 1: time labels column */}
        <div style={{ gridColumn: 1, gridRow: 2, height: totalHeightPx }}>
          {Array.from({ length: totalRows }, (_, i) => {
            const minutes = DAY_START_MINUTES + i * SLOT_MINUTES;
            const showLabel = minutes % 60 === 0 || (minutes % 60 === 30 && totalRows <= 48);
            return (
              <div
                key={i}
                className="print-time-cell"
                style={{ height: SLOT_HEIGHT_PX, lineHeight: `${SLOT_HEIGHT_PX}px` }}
              >
                {showLabel ? minutesToHHmm(minutes) : ""}
              </div>
            );
          })}
        </div>
        {/* Row 1: worker lanes (time grid + blocks) */}
        {workersWithUnassigned.map((w, colIndex) => (
          <div
            key={w.id}
            className="print-worker-lane print-grid-section"
            style={{
              gridColumn: colIndex + 2,
              gridRow: 2,
              height: totalHeightPx,
              position: "relative",
            }}
          >
            {/* Slot lines */}
            {Array.from({ length: totalRows }, (_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: i * SLOT_HEIGHT_PX,
                  height: SLOT_HEIGHT_PX,
                  borderTop: "1px solid #e5e7eb",
                }}
              />
            ))}
            {/* Booking blocks */}
            {blocksWithPosition
              .filter((b) => b.workerColumnIndex === colIndex)
              .map((block) => {
                const backgroundColor = block.color ?? "#3B82F6";
                const textColor = getTextColorHex(backgroundColor);
                const chemicalSummary = chemicalCardSummary(chemicalCardsMap[block.clientKey] ?? null);
                return (
                  <div
                    key={block.id}
                    className="print-block"
                    style={{
                      top: block.topPx,
                      height: Math.max(block.heightPx - 2, 14),
                      backgroundColor,
                      color: textColor,
                    }}
                  >
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {block.clientName} — {block.serviceName}
                    </span>
                    <span className="print-block-line2" style={{ color: textColor }}>
                      {chemicalSummary}
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
