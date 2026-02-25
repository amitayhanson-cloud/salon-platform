"use client";

import { useMemo } from "react";
import { isBookingCancelled } from "@/lib/normalizeBooking";
import DayGrid from "./DayGrid";

/** Height of the worker header row so worker names are fully visible (not clipped). */
const HEADER_HEIGHT_PX = 56;
interface Booking {
  id: string;
  date: string;
  time: string;
  durationMin: number;
  serviceName: string;
  serviceType?: string;
  serviceId?: string;
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
  /** phase 1 = main, phase 2 = follow-up (separate booking doc). Each doc = one block. */
  phase?: 1 | 2;
  parentBookingId?: string | null;
  start?: Date | { toDate: () => Date } | null;
  end?: Date | { toDate: () => Date } | null;
  startAt?: Date | { toDate: () => Date } | null;
  endAt?: Date | { toDate: () => Date } | null;
  followUpStartAt?: Date | { toDate: () => Date } | null;
  followUpEndAt?: Date | { toDate: () => Date } | null;
  followUpServiceId?: string | null;
  followUpWorkerId?: string | null;
  secondaryStartAt?: Date | { toDate: () => Date } | null;
  secondaryEndAt?: Date | { toDate: () => Date } | null;
  secondaryWorkerId?: string | null;
  waitMin?: number;
  waitMinutes?: number;
  secondaryDurationMin?: number;
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
}

export type RenderBlock = {
  id: string;
  phase: 1 | 2;
  bookingId: string;
  workerId: string;
  startAt: Date;
  endAt: Date;
  clientName: string;
  serviceName: string;
  /** Booking notes (הערות) for calendar card display only */
  notes?: string | null;
  color?: string;
  status: string;
  isSecondary: boolean;
};

function toDate(val: Date | { toDate: () => Date } | null | undefined): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return val;
  if (typeof (val as { toDate: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
  return null;
}

/**
 * Build start Date from date string (YYYY-MM-DD) and time string (HH:mm).
 * Used so phase 2 block position matches the modal (which shows time – getEndTime).
 */
function startFromDateAndTime(
  dateStr: string,
  timeStr: string
): Date | null {
  if (!dateStr || !timeStr) return null;
  const parts = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  if (parts.length !== 3 || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

/**
 * One booking doc = one block. Calendar uses the SAME start/end as the booking details modal.
 * Phase 1 and phase 2: startAt/endAt from this doc (or start/end). Fallback to dateStr+timeStr only when missing.
 * No parent-derived times; no gap/wait display hacks. Positioning: computeBlockPosition (minutesFromDayStart * pxPerMin).
 */
/** Sentinel for bookings with no worker (show in "ללא מטפל" column). */
export const UNASSIGNED_WORKER_ID = "__unassigned__";

export function bookingToBlock(
  booking: Booking,
  _allBookings?: Booking[]
): RenderBlock | null {
  const phase = booking.phase ?? 1;
  const rawWorkerId = booking.workerId ?? "";
  const workerId = rawWorkerId && String(rawWorkerId).trim() !== "" ? rawWorkerId : UNASSIGNED_WORKER_ID;

  const dateStr = (booking as { dateStr?: string }).dateStr ?? booking.date ?? "";
  const timeStr = (booking as { timeHHmm?: string }).timeHHmm ?? booking.time ?? "";

  // Use the same start/end as the booking details modal: doc's startAt/endAt (or start/end).
  // No parent-derived times; no gap/wait display hacks. Calendar renders at the exact times shown in details.
  let startAt: Date | null = toDate(booking.start ?? booking.startAt);
  const durationMin = booking.durationMin ?? 60;
  let endAt: Date | null = toDate(booking.end ?? booking.endAt);

  // Phase 2: same as phase 1 — use this booking doc's start/end. Fallback to dateStr+timeStr only when missing.
  if (phase === 2 && (!startAt || !endAt || endAt.getTime() <= startAt.getTime()) && dateStr && timeStr) {
    const fromDoc = startFromDateAndTime(dateStr, timeStr);
    if (fromDoc) {
      startAt = fromDoc;
      endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);
    }
  }

  if (!startAt) return null;

  const clientName = booking.customerName ?? booking.clientName ?? "—";
  const baseServiceName =
    (booking as { displayServiceName?: string }).displayServiceName ??
    booking.serviceName ??
    (booking as { serviceId?: string }).serviceId ??
    "—";
  const serviceType = booking.serviceType ?? "";
  const displayName = serviceType ? `${baseServiceName} / ${serviceType}` : baseServiceName;
  const notes = (booking as { notes?: string }).notes ?? booking.note ?? null;

  if (phase === 1) {
    endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);
  }
  if (phase === 2 && startAt && (!endAt || endAt.getTime() <= startAt.getTime())) {
    endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);
  }
  if (!endAt) return null;

  const block: RenderBlock = {
    id: `${booking.id}:phase-${phase}`,
    phase,
    bookingId: booking.id,
    workerId,
    startAt,
    endAt,
    clientName,
    serviceName: displayName,
    notes: notes && String(notes).trim() ? String(notes).trim() : null,
    color: booking.serviceColor ?? undefined,
    status: booking.status ?? "booked",
    isSecondary: phase === 2,
  };

  return block;
}

interface Worker {
  id: string;
  name: string;
}

export type BreakRange = { start: string; end: string };

interface MultiWorkerScheduleViewProps {
  date: string; // YYYY-MM-DD
  bookings: Booking[];
  workers: Worker[]; // All workers to render columns for
  startHour?: number; // Default 8
  endHour?: number; // Default 20
  /** Break ranges to show as greyed-out blocks (business-level breaks). */
  breaks?: BreakRange[];
  /** Per-worker break ranges for the current day (All Workers view: overlay per column). */
  workerBreaksByWorkerId?: Record<string, BreakRange[]>;
  onBookingClick?: (booking: Booking) => void; // Callback when booking block is clicked
}

/**
 * Multi-worker timeline view for a single day
 * Renders one column per worker with bookings positioned by time
 * Time bar stays on the right
 */
export default function MultiWorkerScheduleView({
  date,
  bookings,
  workers,
  startHour = 8,
  endHour = 20,
  breaks,
  workerBreaksByWorkerId,
  onBookingClick,
}: MultiWorkerScheduleViewProps) {
  const confirmedBookings = useMemo(() => bookings.filter((b) => !isBookingCancelled(b)), [bookings]);
  const workersToRender = useMemo(() => {
    const workerIds = new Set(workers.map((w) => w.id));
    const hasNullWorker = confirmedBookings.some((b) => (b.workerId ?? null) === null);
    const hasUnknownWorker = confirmedBookings.some((b) => {
      const wid = b.workerId ?? null;
      return wid !== null && !workerIds.has(wid);
    });
    if (hasNullWorker || hasUnknownWorker) {
      return [...workers, { id: UNASSIGNED_WORKER_ID, name: "ללא מטפל" }];
    }
    return workers;
  }, [confirmedBookings, workers]);

  return (
    <div className="flex flex-col w-full flex-1 min-h-0">
      {/* Worker names header row: fixed height, never clipped, above scroll area */}
      {workersToRender.length > 0 && (
        <div
          className="shrink-0 h-14 flex items-center border-b-2 border-slate-300 z-20 bg-white/90 backdrop-blur-sm grid"
          style={{
            gridTemplateColumns: `${56}px repeat(${workersToRender.length}, minmax(140px, 1fr))`,
            minWidth: `${56 + workersToRender.length * 140}px`,
          }}
        >
          <div className="flex items-center justify-end pr-2 text-slate-500 text-xs font-medium border-r border-slate-200" />
          {workersToRender.map((worker, index) => (
            <div
              key={worker.id}
              className="flex items-center justify-center bg-slate-50 border-r border-slate-200 px-2 py-2"
              style={{ borderLeft: index === 0 ? "1px solid rgb(226 232 240)" : undefined }}
            >
              <span className="text-sm font-semibold text-slate-900 text-center leading-tight break-words" style={{ wordBreak: "break-word" }}>
                {worker.name}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Scrollable grid body only */}
      <div className="flex-1 min-h-0 overflow-auto w-full">
        {workersToRender.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">אין עובדים</div>
        ) : (
          <DayGrid
            dateISO={date}
            bookings={bookings}
            workers={workersToRender}
            startHour={startHour}
            endHour={endHour}
            breaks={breaks}
            workerBreaksByWorkerId={workerBreaksByWorkerId}
            onBookingClick={
              onBookingClick
                ? (b: unknown): void => {
                    onBookingClick(b as Booking);
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
