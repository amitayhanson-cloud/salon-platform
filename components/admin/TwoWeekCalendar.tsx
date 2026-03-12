"use client";

import { ymdLocal } from "@/lib/dateLocal";
import { toYYYYMMDD } from "@/lib/calendarUtils";
import { useRouter } from "next/navigation";
import { getAdminBasePathFromSiteId } from "@/lib/url";

const DAY_LABELS_SHORT: Record<string, string> = {
  "0": "א׳", "1": "ב׳", "2": "ג׳", "3": "ד׳", "4": "ה׳", "5": "ו׳", "6": "ש׳",
};

const DAY_LABELS_FULL: Record<string, string> = {
  "0": "ראשון", "1": "שני", "2": "שלישי", "3": "רביעי", "4": "חמישי", "5": "שישי", "6": "שבת",
};

const MONTH_NAMES_HE: string[] = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

interface BookingSummary {
  id: string;
  time: string;
  serviceName: string;
  workerName?: string;
}

interface TwoWeekCalendarProps {
  dateRange: Date[];
  bookingsByDay: Record<string, BookingSummary[]>;
  selectedDay?: string;
  onDayClick: (date: string) => void;
  siteId: string;
}

/** Booking load indicator: 1–3 thin bars, or +N for many. No text. */
function LoadIndicator({ count }: { count: number }) {
  if (count <= 0) return null;
  const bars = count <= 3 ? count : 3;
  const showPlus = count > 3;

  return (
    <div className="flex flex-col gap-0.5 items-center justify-start w-full min-h-[18px]" aria-hidden>
      <div className="flex flex-col gap-0.5 w-full max-w-[20px]">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className="h-1 w-full rounded-full bg-[#1E6F7C] opacity-[0.35 + i * 0.2]"
          />
        ))}
      </div>
      {showPlus && (
        <span className="text-[10px] font-medium text-[#1E6F7C]/80 leading-tight mt-0.5">
          +{count - 3}
        </span>
      )}
    </div>
  );
}

export default function TwoWeekCalendar({
  dateRange,
  bookingsByDay,
  selectedDay,
  onDayClick,
  siteId,
}: TwoWeekCalendarProps) {
  const router = useRouter();
  const todayKey = ymdLocal(new Date());

  const formatDayLabelShort = (date: Date) =>
    `${DAY_LABELS_SHORT[date.getDay().toString()]} ${date.getDate()}`;

  const formatDayLabelFull = (date: Date) =>
    `${DAY_LABELS_FULL[date.getDay().toString()]} ${date.getDate()}`;

  const formatMonthShort = (date: Date): string => {
    return MONTH_NAMES_HE[date.getMonth()];
  };

  const handleDayClick = (date: Date) => {
    const dayKey = toYYYYMMDD(date);
    onDayClick(dayKey);
    router.push(`${getAdminBasePathFromSiteId(siteId)}/bookings/day/${dayKey}`);
  };

  return (
    <>
      {/* Mobile: compact 2-week overview, indicators only */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1.5">
          {dateRange.map((day) => {
            const dayKey = toYYYYMMDD(day);
            const dayBookings = bookingsByDay[dayKey] || [];
            const count = dayBookings.length;
            const isSelected = selectedDay === dayKey;
            const isToday = dayKey === todayKey;

            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => handleDayClick(day)}
                className={`
                  flex flex-col items-center justify-start rounded-xl border min-h-[64px] py-2 px-1
                  transition-colors touch-manipulation active:scale-[0.98]
                  ${isSelected ? "border-[#1E6F7C] bg-[rgba(30,111,124,0.1)] ring-2 ring-[#1E6F7C]/30" : ""}
                  ${!isSelected && isToday ? "border-[#1E6F7C]/50 bg-[rgba(30,111,124,0.06)]" : ""}
                  ${!isSelected && !isToday ? "border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]" : ""}
                `}
                aria-label={`${formatDayLabelFull(day)}, ${count} תורים`}
              >
                <span className="text-[10px] text-slate-400 leading-tight">
                  {formatMonthShort(day)}
                </span>
                <span
                  className={`
                    text-lg font-semibold leading-tight mt-0.5 tabular-nums
                    ${isToday ? "text-[#1E6F7C]" : "text-slate-800"}
                  `}
                >
                  {day.getDate()}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {DAY_LABELS_SHORT[day.getDay().toString()]}
                </span>
                <div className="pt-1.5 w-full flex justify-center">
                  <LoadIndicator count={count} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: keep existing layout with booking count and first 3 lines */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-2">
          {dateRange.map((day) => {
            const dayKey = toYYYYMMDD(day);
            const dayBookings = bookingsByDay[dayKey] || [];
            const isSelected = selectedDay === dayKey;
            const isToday = dayKey === todayKey;

            return (
              <div
                key={dayKey}
                role="button"
                tabIndex={0}
                onClick={() => handleDayClick(day)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleDayClick(day);
                  }
                }}
                className={`
                  border rounded-lg p-2 cursor-pointer transition-colors min-h-[120px]
                  ${isSelected ? "border-[#1E6F7C] bg-[rgba(30,111,124,0.08)]" : "border-slate-200 hover:border-slate-300"}
                  ${isToday ? "bg-[rgba(15,23,42,0.04)]" : ""}
                `}
              >
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  {formatDayLabelFull(day)}
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  {dayBookings.length} {dayBookings.length === 1 ? "תור" : "תורים"}
                </div>
                <div className="space-y-1">
                  {dayBookings.slice(0, 3).map((booking: BookingSummary) => (
                    <div
                      key={booking.id}
                      className="truncate rounded bg-[rgba(30,111,124,0.08)] px-1 py-0.5 text-xs text-[#1E6F7C]"
                      title={`${booking.time} ${booking.serviceName} ${booking.workerName ? `(${booking.workerName})` : ""}`}
                    >
                      {booking.time} {booking.serviceName}
                    </div>
                  ))}
                  {dayBookings.length > 3 && (
                    <div className="text-xs text-slate-500">
                      +{dayBookings.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
