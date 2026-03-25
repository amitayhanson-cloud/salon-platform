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

/** Appointment calendar day YYYY-MM-DD from booking or archive doc */
export function appointmentYmd(data: Record<string, unknown>): string {
  const raw = String((data.dateISO as string) || (data.date as string) || "").trim();
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
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
      const ymd = appointmentYmd(data);
      if (ymd.length < 10 || ymd < monthStart || ymd > monthEnd) continue;
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
