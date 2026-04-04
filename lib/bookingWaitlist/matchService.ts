import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";

export type FreedBookingSlot = {
  dateYmd: string;
  timeHHmm: string;
  workerId: string | null;
  workerName?: string | null;
  serviceTypeId: string | null;
  serviceId: string | null;
  serviceName: string;
  durationMin: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Whether a waitlist entry wants this freed slot (service + optional prefs). */
export function waitlistEntryMatchesFreedSlot(
  entry: Pick<
    BookingWaitlistEntry,
    | "serviceTypeId"
    | "serviceId"
    | "serviceName"
    | "preferredDateYmd"
    | "preferredWorkerId"
  >,
  slot: FreedBookingSlot
): boolean {
  const prefDate = entry.preferredDateYmd?.trim();
  if (prefDate && prefDate !== slot.dateYmd) return false;

  const prefW = entry.preferredWorkerId?.trim();
  if (prefW && slot.workerId && prefW !== slot.workerId) return false;

  const et = entry.serviceTypeId?.trim() || null;
  const st = slot.serviceTypeId?.trim() || null;
  if (et && st && et === st) return true;

  const eid = entry.serviceId?.trim() || null;
  const sid = slot.serviceId?.trim() || null;
  if (eid && sid && eid === sid) return true;

  const en = norm(entry.serviceName || "");
  const sn = norm(slot.serviceName || "");
  if (en && sn && (en === sn || sn.includes(en) || en.includes(sn))) return true;

  return false;
}
