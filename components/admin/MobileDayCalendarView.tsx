"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight, ChevronLeft } from "lucide-react";
import { fromYYYYMMDD, toYYYYMMDD, adjacentDateKey } from "@/lib/calendarUtils";
import DayScheduleView from "./DayScheduleView";
import BookingCalendarLegend from "./BookingCalendarLegend";
import type { BreakRange } from "@/types/bookingSettings";

const DAY_LABELS_SHORT: Record<string, string> = {
  "0": "א׳", "1": "ב׳", "2": "ג׳", "3": "ד׳", "4": "ה׳", "5": "ו׳", "6": "ש׳",
};

interface Worker {
  id: string;
  name: string;
}

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
  customerPhone?: string;
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
  secondaryDurationMin?: number;
}

export interface MobileDayCalendarViewProps {
  dateKey: string;
  workers: Worker[];
  selectedWorkerId: string;
  onWorkerChange: (workerId: string) => void;
  bookings: Booking[];
  startHour: number;
  endHour: number;
  /** Business/day-level breaks. Normalized to [] if undefined/null or not an array. */
  dayBreaks?: BreakRange[] | null;
  /** Per-worker break ranges. Normalized to {} if undefined/null; values normalized to []. */
  workerBreaksByWorkerId?: Record<string, BreakRange[] | null | undefined> | null;
  onBookingClick: (booking: Booking) => void;
  onAddBooking: () => void;
  adminBasePath: string;
  isClosed?: boolean;
}

/** Start of the actual calendar week (Sunday) containing the given date. */
function getWeekStartForDate(dateKey: string): string {
  const d = fromYYYYMMDD(dateKey);
  const dayOfWeek = d.getDay();
  return adjacentDateKey(dateKey, -dayOfWeek);
}

/** 7 consecutive days of one full week starting from weekStart (Sun–Sat). */
function getSevenDaysFromStart(weekStart: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(adjacentDateKey(weekStart, i));
  }
  return out;
}

export default function MobileDayCalendarView({
  dateKey,
  workers,
  selectedWorkerId,
  onWorkerChange,
  bookings,
  startHour,
  endHour,
  dayBreaks = [],
  workerBreaksByWorkerId = {},
  onBookingClick,
  onAddBooking,
  adminBasePath,
  isClosed,
}: MobileDayCalendarViewProps) {
  const router = useRouter();

  const [visibleWeekStart, setVisibleWeekStart] = useState<string | null>(null);

  useEffect(() => {
    if (!dateKey) return;
    const weekStart = getWeekStartForDate(dateKey);
    setVisibleWeekStart((prev) => {
      if (prev === null) return weekStart;
      const seven = getSevenDaysFromStart(prev);
      if (!seven.includes(dateKey)) return weekStart;
      return prev;
    });
  }, [dateKey]);

  const currentWeekStart = visibleWeekStart ?? (dateKey ? getWeekStartForDate(dateKey) : null);
  const sevenDays = useMemo(
    () => (currentWeekStart ? getSevenDaysFromStart(currentWeekStart) : []),
    [currentWeekStart]
  );

  const goToPrevWeek = () => {
    setVisibleWeekStart((prev) => (prev ? adjacentDateKey(prev, -7) : prev));
  };
  const goToNextWeek = () => {
    setVisibleWeekStart((prev) => (prev ? adjacentDateKey(prev, 7) : prev));
  };

  // On mobile show one worker at a time; default to first if "all"
  const effectiveWorkerId = selectedWorkerId === "all" ? (workers[0]?.id ?? "") : selectedWorkerId;

  const breaksForWorker = useMemo((): BreakRange[] => {
    const normalizedDayBreaks = Array.isArray(dayBreaks) ? dayBreaks : [];
    const byWorker = workerBreaksByWorkerId ?? {};
    const workerBreaks = Array.isArray(byWorker[effectiveWorkerId]) ? byWorker[effectiveWorkerId]! : [];
    return effectiveWorkerId ? [...normalizedDayBreaks, ...workerBreaks] : normalizedDayBreaks;
  }, [effectiveWorkerId, dayBreaks, workerBreaksByWorkerId]);

  const goToDay = (newDateKey: string) => {
    const query = effectiveWorkerId ? `?workerId=${encodeURIComponent(effectiveWorkerId)}` : "";
    router.push(`${adminBasePath}/bookings/day/${newDateKey}${query}`);
  };

  const goToMainCalendar = () => {
    router.push(adminBasePath + "/bookings");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden md:hidden" dir="rtl">
      {/* Compact header: worker filter on one side; back icon + add button on the other (mobile only) */}
      <div className="flex-shrink-0 border-b border-[#E2E8F0] bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <select
            value={effectiveWorkerId}
            onChange={(e) => onWorkerChange(e.target.value)}
            className="min-w-[100px] w-[140px] max-w-[50%] rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-2 text-sm font-medium text-slate-800 focus:border-[#1E6F7C] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/20"
            aria-label="בחר עובד"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 shrink-0 flex-row-reverse">
            <button
              type="button"
              onClick={goToMainCalendar}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-slate-600 transition-colors hover:bg-[#F8FAFC] hover:text-[#1E6F7C] hover:border-[#1E6F7C]/40"
              aria-label="חזרה ליומן"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onAddBooking}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#0F172A] px-3 text-sm font-medium text-white hover:bg-[#1E293B]"
            >
              <span>הוסף</span>
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 7-day strip: actual week (Sun–Sat); week nav moves by full week; tapping a day only updates selection */}
      <div className="flex-shrink-0 border-b border-[#E2E8F0] bg-[#F8FAFC] px-2 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
            aria-label="שבוע קודם"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-between gap-1">
            {sevenDays.map((d) => {
              const date = fromYYYYMMDD(d);
              const isSelected = d === dateKey;
              const today = toYYYYMMDD(new Date()) === d;
              const dayNum = date.getDate();
              const weekday = DAY_LABELS_SHORT[date.getDay().toString()] ?? "";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => goToDay(d)}
                  className={`
                    flex flex-1 flex-col items-center justify-center rounded-lg py-2 text-center transition-colors
                    ${isSelected ? "bg-[#1E6F7C] text-white shadow-sm" : today ? "bg-slate-200/60 text-slate-800 font-medium" : "text-slate-600 hover:bg-white hover:text-slate-900"}
                  `}
                  aria-label={`${dayNum} ${weekday}`}
                  aria-pressed={isSelected}
                >
                  <span className="text-[10px] opacity-90">{weekday}</span>
                  <span className="text-base font-semibold tabular-nums">{dayNum}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={goToNextWeek}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
            aria-label="שבוע הבא"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
        <BookingCalendarLegend compact className="mt-2 px-1 text-[11px]" />
      </div>

      {/* Timeline */}
      <div className={`flex-1 min-h-0 overflow-auto bg-white ${isClosed ? "opacity-75" : ""}`}>
        {!effectiveWorkerId ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-sm text-slate-500">אין עובדים להצגה</p>
          </div>
        ) : (
          <div className="h-full min-h-[400px] p-3 pr-1 md:p-3">
            <DayScheduleView
              date={dateKey}
              bookings={bookings}
              selectedWorkerId={effectiveWorkerId}
              startHour={startHour}
              endHour={endHour}
              breaks={breaksForWorker}
              onBookingClick={onBookingClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
