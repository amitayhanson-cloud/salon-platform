/**
 * Fetch aggregate stats for the admin dashboard (clients, workers, bookings).
 * Uses Firestore getCountFromServer where possible to avoid loading documents.
 */

import {
  query,
  where,
  getCountFromServer,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  clientsCollection,
  workersCollection,
  bookingsCollection,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { getSundayStart } from "@/lib/calendarUtils";

export type SiteStats = {
  clientsCount: number | null;
  workersCount: number | null;
  bookingsThisWeek: number | null;
  upcomingBookings: number | null;
};

function getStartOfWeekYmd(): string {
  const sunday = getSundayStart(new Date());
  return ymdLocal(sunday);
}

function getEndOfWeekYmd(): string {
  const sunday = getSundayStart(new Date());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return ymdLocal(saturday);
}

export async function fetchSiteStats(siteId: string): Promise<SiteStats> {
  const result: SiteStats = {
    clientsCount: null,
    workersCount: null,
    bookingsThisWeek: null,
    upcomingBookings: null,
  };

  if (!db || !siteId) return result;

  const today = ymdLocal(new Date());
  const startWeek = getStartOfWeekYmd();
  const endWeek = getEndOfWeekYmd();

  try {
    const [clientsSnap, workersSnap, weekBookingsSnap, upcomingSnap] =
      await Promise.all([
        getCountFromServer(query(clientsCollection(siteId))),
        getCountFromServer(query(workersCollection(siteId))),
        getCountFromServer(
          query(
            bookingsCollection(siteId),
            where("dateISO", ">=", startWeek),
            where("dateISO", "<=", endWeek)
          )
        ).catch(() => null),
        getCountFromServer(
          query(
            bookingsCollection(siteId),
            where("dateISO", ">=", today)
          )
        ).catch(() => null),
      ]);

    result.clientsCount = clientsSnap.data().count;
    result.workersCount = workersSnap.data().count;
    result.bookingsThisWeek = weekBookingsSnap?.data().count ?? null;
    result.upcomingBookings = upcomingSnap?.data().count ?? null;
  } catch (e) {
    console.warn("[fetchSiteStats]", e);
  }

  return result;
}
