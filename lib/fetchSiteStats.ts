/**
 * Fetch aggregate stats for the admin dashboard (clients, bookings, revenue).
 * Uses Firestore getCountFromServer where possible; monthly booking slice uses getDocs
 * to derive count, today's count, and revenue in one read.
 */

import {
  query,
  where,
  getCountFromServer,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  clientsCollection,
  bookingsCollection,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";

export type SiteStats = {
  clientsCount: number | null;
  newCustomersThisMonth: number | null;
  bookingsToday: number | null;
  bookingsThisMonth: number | null;
  revenueThisMonth: number | null;
};

function getMonthYmdBounds(d = new Date()): { start: string; end: string } {
  const y = d.getFullYear();
  const mo = d.getMonth();
  const start = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  const last = new Date(y, mo + 1, 0).getDate();
  const end = `${y}-${String(mo + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function numericBookingPrice(data: Record<string, unknown>): number {
  const raw = data.price ?? data.priceApplied ?? data.finalPrice;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, raw);
  }
  return 0;
}

export async function fetchSiteStats(siteId: string): Promise<SiteStats> {
  const result: SiteStats = {
    clientsCount: null,
    newCustomersThisMonth: null,
    bookingsToday: null,
    bookingsThisMonth: null,
    revenueThisMonth: null,
  };

  if (!db || !siteId) return result;

  const today = ymdLocal(new Date());
  const { start: monthStart, end: monthEnd } = getMonthYmdBounds();
  const now = new Date();
  const clientMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const clientMonthNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  const monthStartTs = Timestamp.fromDate(clientMonthStart);
  const monthNextTs = Timestamp.fromDate(clientMonthNext);

  try {
    const [clientsSnap, newCustomersSnap, monthBookingsSnap] = await Promise.all([
      getCountFromServer(query(clientsCollection(siteId))),
      getCountFromServer(
        query(
          clientsCollection(siteId),
          where("createdAt", ">=", monthStartTs),
          where("createdAt", "<", monthNextTs)
        )
      ).catch(() => null),
      getDocs(
        query(
          bookingsCollection(siteId),
          where("dateISO", ">=", monthStart),
          where("dateISO", "<=", monthEnd)
        )
      ).catch(() => null),
    ]);

    result.clientsCount = clientsSnap.data().count;
    result.newCustomersThisMonth = newCustomersSnap?.data().count ?? null;

    if (monthBookingsSnap) {
      let revenue = 0;
      let todayCount = 0;
      for (const doc of monthBookingsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        revenue += numericBookingPrice(data);
        if (data.dateISO === today) todayCount += 1;
      }
      result.bookingsThisMonth = monthBookingsSnap.docs.length;
      result.bookingsToday = todayCount;
      result.revenueThisMonth = revenue;
    }
  } catch (e) {
    console.warn("[fetchSiteStats]", e);
  }

  return result;
}
