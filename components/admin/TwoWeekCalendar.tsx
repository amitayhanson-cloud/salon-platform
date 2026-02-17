"use client";

import { ymdLocal } from "@/lib/dateLocal";
import { toYYYYMMDD } from "@/lib/calendarUtils";
import { useRouter } from "next/navigation";
import { getAdminBasePathFromSiteId } from "@/lib/url";

const DAY_LABELS: Record<string, string> = {
  "0": "ראשון",
  "1": "שני",
  "2": "שלישי",
  "3": "רביעי",
  "4": "חמישי",
  "5": "שישי",
  "6": "שבת",
};

interface BookingSummary {
  id: string;
  time: string;
  serviceName: string;
  workerName?: string;
}

interface DaySummary {
  date: string; // YYYY-MM-DD
  bookings: BookingSummary[];
  count: number;
}

interface TwoWeekCalendarProps {
  dateRange: Date[];
  bookingsByDay: Record<string, BookingSummary[]>;
  selectedDay?: string; // YYYY-MM-DD
  onDayClick: (date: string) => void;
  siteId: string;
}

export default function TwoWeekCalendar({
  dateRange,
  bookingsByDay,
  selectedDay,
  onDayClick,
  siteId,
}: TwoWeekCalendarProps) {
  const router = useRouter();

  const formatDayLabel = (date: Date): string => {
    const dayIndex = date.getDay().toString();
    return `${DAY_LABELS[dayIndex]} ${date.getDate()}`;
  };

  const handleDayClick = (date: Date) => {
    const dayKey = toYYYYMMDD(date);
    onDayClick(dayKey);
    router.push(`${getAdminBasePathFromSiteId(siteId)}/bookings/day/${dayKey}`);
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {dateRange.map((day) => {
        const dayKey = toYYYYMMDD(day);
        const dayBookings = bookingsByDay[dayKey] || [];
        const isSelected = selectedDay === dayKey;
        const isToday = dayKey === ymdLocal(new Date());

        return (
          <div
            key={dayKey}
            onClick={() => handleDayClick(day)}
            className={`border rounded-lg p-2 cursor-pointer transition-colors min-h-[120px] ${
              isSelected
                ? "border-caleno-500 bg-caleno-50"
                : "border-slate-200 hover:border-slate-300"
            } ${isToday ? "bg-blue-50" : ""}`}
          >
            <div className="text-xs font-semibold text-slate-700 mb-1">
              {formatDayLabel(day)}
            </div>
            <div className="text-xs text-slate-500 mb-2">
              {dayBookings.length} {dayBookings.length === 1 ? "booking" : "bookings"}
            </div>
            <div className="space-y-1">
              {dayBookings.slice(0, 3).map((booking: BookingSummary) => (
                <div
                  key={booking.id}
                  className="text-xs bg-caleno-100 text-caleno-700 rounded px-1 py-0.5 truncate"
                  title={`${booking.time} ${booking.serviceName} ${booking.workerName ? `(${booking.workerName})` : ""}`}
                >
                  {booking.time} {booking.serviceName}
                </div>
              ))}
              {dayBookings.length > 3 && (
                <div className="text-xs text-slate-500">
                  +{dayBookings.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
