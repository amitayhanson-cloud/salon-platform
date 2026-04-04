/**
 * Overlap check for a worker/day using Firebase Admin (server-side waitlist auto-book).
 */

import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  findWorkerConflictFromBookings,
  type BookingLikeForConflict,
} from "@/lib/bookingConflicts";

type AdminFirestore = ReturnType<typeof getAdminDb>;

export async function checkWorkerConflictsAdmin(
  db: AdminFirestore,
  siteId: string,
  workerId: string,
  dayISO: string,
  startAt: Date,
  endAt: Date,
  excludeBookingIds: string[] = []
): Promise<{ hasConflict: boolean; conflictingBooking?: { id: string; timeRange: string } }> {
  const col = db.collection("sites").doc(siteId).collection("bookings");
  const snapshot = await col.where("workerId", "==", workerId).where("dateISO", "==", dayISO).get();
  const bookings: BookingLikeForConflict[] = snapshot.docs
    .filter((doc: QueryDocumentSnapshot) => doc.data().isArchived !== true)
    .map((doc: QueryDocumentSnapshot) => {
      const d = doc.data();
      return {
        id: doc.id,
        workerId: d.workerId ?? null,
        startAt: d.startAt,
        endAt: d.endAt,
        dateISO: (d.dateISO ?? d.date ?? "") as string,
        status: (d.status as string) ?? "booked",
      };
    });
  const r = findWorkerConflictFromBookings(bookings, workerId, dayISO, startAt, endAt, excludeBookingIds);
  if (!r.hasConflict || !r.conflictingBooking) return { hasConflict: false };
  return {
    hasConflict: true,
    conflictingBooking: {
      id: r.conflictingBooking.id,
      timeRange: r.conflictingBooking.timeRange,
    },
  };
}

export function parseYmdHmToDates(
  dateYmd: string,
  timeHHmm: string,
  durationMin: number
): { startAt: Date; endAt: Date } | null {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHHmm.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const startAt = new Date(y, m - 1, d, hh, mm, 0, 0);
  const endAt = new Date(startAt.getTime() + Math.max(1, durationMin) * 60 * 1000);
  return { startAt, endAt };
}
