"use client";

import StatusDot from "@/components/StatusDot";

type BookingCalendarLegendProps = {
  compact?: boolean;
  className?: string;
};

/**
 * Legend for calendar booking indicators:
 * - status colored dots
 * - red note marker shown on cards with booking notes
 */
export default function BookingCalendarLegend({
  compact = false,
  className = "",
}: BookingCalendarLegendProps) {
  return (
    <div
      dir="rtl"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 ${className}`}
      aria-label="מקרא סטטוסים ביומן"
    >
      <span className={`font-medium text-slate-700 ${compact ? "mr-0" : "mr-1"}`}>מקרא:</span>

      <span className="inline-flex items-center gap-1.5">
        <StatusDot statusKey="booked" size={9} />
        <span>נקבע</span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <StatusDot statusKey="pending" size={9} />
        <span>ממתין</span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <StatusDot statusKey="confirmed" size={9} />
        <span>מאושר</span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-flex h-2.5 w-4 rounded-full border border-white/80 bg-red-500 shadow-sm"
          aria-hidden
        />
        <span>יש הערה בתור</span>
      </span>
    </div>
  );
}
