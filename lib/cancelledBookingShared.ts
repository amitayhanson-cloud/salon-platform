/**
 * Shared rules for “cancelled booking” lists (admin cancelled page + dashboard metrics).
 * Must stay in sync with what fetchCancelledArchivedBookings shows.
 */

import type { Firestore } from "firebase-admin/firestore";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

export const CANCELLED_STATUSES = [
  "cancelled",
  "canceled",
  "cancelled_by_salon",
  "no_show",
] as const;

export function isCancelledStatus(s: string | null | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  return CANCELLED_STATUSES.includes(s.toLowerCase() as (typeof CANCELLED_STATUSES)[number]);
}

/** Matches fetchCancelledArchivedBookings: status, statusAtArchive, or displayedStatus */
export function isDocCancelled(data: Record<string, unknown>): boolean {
  const status = (data.status as string) ?? "";
  const statusAtArchive = (data.statusAtArchive as string) ?? "";
  const displayedStatus = (data.displayedStatus as string) ?? "";
  return (
    isCancelledStatus(status) ||
    isCancelledStatus(statusAtArchive) ||
    isCancelledStatus(displayedStatus)
  );
}

/** Padded YYYY-MM-DD from `dateISO` / `date`, or null if not parseable (handles unpadded months/days). */
export function normalizeBookingYmd(data: Record<string, unknown>): string | null {
  const raw = String((data.dateISO as string) || (data.date as string) || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Appointment calendar day YYYY-MM-DD from booking or archive doc */
export function appointmentYmd(data: Record<string, unknown>): string {
  return normalizeBookingYmd(data) ?? "";
}

/**
 * Count cancelled archived rows whose appointment falls in [monthStart, monthEnd] (YYYY-MM-DD).
 * Same subcollections as fetchCancelledArchivedBookings (per-client archivedServiceTypes).
 */
export async function countArchivedCancelledInAppointmentMonthAdmin(
  db: Firestore,
  siteId: string,
  monthStart: string,
  monthEnd: string
): Promise<number> {
  const clientsSnap = await db.collection("sites").doc(siteId).collection("clients").get();
  let n = 0;
  for (const c of clientsSnap.docs) {
    const archSnap = await c.ref.collection("archivedServiceTypes").get();
    for (const d of archSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (isFollowUpBooking(data)) continue;
      if (!isDocCancelled(data)) continue;
      const ymd = normalizeBookingYmd(data);
      if (!ymd || ymd < monthStart || ymd > monthEnd) continue;
      n++;
    }
  }
  return n;
}

/**
 * Count cancelled booking docs in a snapshot already restricted to appointment month (e.g. dateISO range).
 */
export function countCancelledInBookingsMonthSnapshot(
  docs: Array<{ data: () => Record<string, unknown> }>
): number {
  let n = 0;
  for (const doc of docs) {
    const data = doc.data();
    if (isFollowUpBooking(data)) continue;
    if (!isDocCancelled(data)) continue;
    n++;
  }
  return n;
}
