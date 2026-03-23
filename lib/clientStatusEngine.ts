import type { AutomatedClientStatus, ClientStatusRules } from "@/types/clientStatus";

export type BookingForStatus = {
  date?: string | null;
  time?: string | null;
  status?: string | null;
};

function toDate(date?: string | null, time?: string | null): Date | null {
  const d = typeof date === "string" ? date.trim() : "";
  if (!d) return null;
  const t = typeof time === "string" && time.trim() ? time.trim() : "00:00";
  const iso = `${d}T${t}:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isBookingQualifying(status?: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return true;
  return s !== "cancelled" && s !== "canceled" && s !== "בוטל";
}

function subtractWindow(now: Date, amount: number, unit: "days" | "months"): Date {
  const n = new Date(now);
  if (unit === "months") {
    n.setMonth(n.getMonth() - amount);
    return n;
  }
  n.setDate(n.getDate() - amount);
  return n;
}

export function calculateAutomatedClientStatus(
  bookings: BookingForStatus[],
  rules: ClientStatusRules,
  now: Date = new Date()
): AutomatedClientStatus {
  const qualifying = bookings
    .filter((b) => isBookingQualifying(b.status))
    .map((b) => toDate(b.date, b.time))
    .filter((d): d is Date => !!d);

  const totalBookings = qualifying.length;
  if (totalBookings < rules.newMaxTotalBookings) return "new";

  const activeSince = subtractWindow(now, rules.activeWindowDays, "days");
  const recentCount = qualifying.filter((d) => d >= activeSince).length;
  if (recentCount >= rules.activeMinBookings) return "active";

  const sleepingSince = subtractWindow(now, rules.sleepingNoBookingsFor, rules.sleepingWindowUnit);
  const hasRecentBooking = qualifying.some((d) => d >= sleepingSince);
  if (!hasRecentBooking) return "sleeping";

  return "normal";
}
