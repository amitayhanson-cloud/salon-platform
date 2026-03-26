import type { AutomatedClientStatus, ClientStatusRules } from "@/types/clientStatus";

export type BookingForStatus = {
  date?: string | null;
  time?: string | null;
  status?: string | null;
  /** When true, row is excluded (same idea as booking docs). */
  cancelled?: boolean | null;
  /** e.g. customer cancelled via WhatsApp — excluded when "cancelled". */
  whatsappStatus?: string | null;
};

function toDate(date?: string | null, time?: string | null): Date | null {
  const d = typeof date === "string" ? date.trim() : "";
  if (!d) return null;
  const t = typeof time === "string" && time.trim() ? time.trim() : "00:00";
  const iso = `${d}T${t}:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isBookingQualifying(b: BookingForStatus): boolean {
  if (b.cancelled === true) return false;
  const wa = (b.whatsappStatus ?? "").trim().toLowerCase();
  if (wa === "cancelled") return false;
  const s = (b.status ?? "").trim().toLowerCase();
  if (!s) return true;
  const disqualified = new Set([
    "cancelled",
    "canceled",
    "בוטל",
    "cancelled_by_salon",
    "no_show",
    "expired",
  ]);
  return !disqualified.has(s);
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
  const qualifyingDates = bookings
    .filter((b) => isBookingQualifying(b))
    .map((b) => toDate(b.date, b.time))
    .filter((d): d is Date => !!d);

  // No usable history (never booked / only cancelled / bad data) follows the "new" threshold rule.
  if (qualifyingDates.length === 0) return "new";

  const nowMs = now.getTime();
  const pastVisits = qualifyingDates.filter((d) => d.getTime() <= nowMs);
  const totalLifetime = qualifyingDates.length;

  // Only upcoming appointments: cannot be "active" from future dates; not "sleeping" if they're engaged.
  if (pastVisits.length === 0) {
    return totalLifetime < rules.newMaxTotalBookings ? "new" : "normal";
  }

  // "חדש" = few lifetime visits.
  if (totalLifetime < rules.newMaxTotalBookings) return "new";

  // "פעיל" = enough *past* visits in the recent window (future bookings don't count)
  const activeSince = subtractWindow(now, rules.activeWindowDays, "days");
  const recentPastCount = pastVisits.filter((d) => d >= activeSince).length;
  if (recentPastCount >= rules.activeMinBookings) return "active";

  // "רדום" = no *past* visit in the sleeping lookback window
  const sleepingSince = subtractWindow(now, rules.sleepingNoBookingsFor, rules.sleepingWindowUnit);
  const hasPastInSleepingWindow = pastVisits.some((d) => d >= sleepingSince);
  if (!hasPastInSleepingWindow) return "sleeping";

  return "normal";
}
