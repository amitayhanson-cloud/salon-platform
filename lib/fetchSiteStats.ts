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
import { bookingDayYmdIsrael } from "@/lib/bookingDayKey";
import { isDocCancelled } from "@/lib/cancelledBookingShared";
import { getDateYMDInTimezone, zonedDayRangeEpochMs } from "@/lib/expiredCleanupUtils";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

const SITE_DAY_TZ = "Asia/Jerusalem";

export type SiteStats = {
  clientsCount: number | null;
  /** Clients with createdAt in current Israel calendar month */
  newCustomersThisMonth: number | null;
  /** Clients with createdAt today (Israel calendar) */
  newCustomersToday: number | null;
  bookingsToday: number | null;
  bookingsThisMonth: number | null;
  /** @deprecated Prefer revenueToday for dashboard headline; still summed for the calendar month */
  revenueThisMonth: number | null;
  /** Sum of booking prices for today (Israel calendar), same inclusion rules as revenueThisMonth */
  revenueToday: number | null;
};

/** Calendar month [start,end] containing `todayYmd` (YYYY-MM-DD). */
function monthYmdBoundsContainingDay(todayYmd: string): { start: string; end: string } {
  const [y, mo] = todayYmd.split("-").map(Number);
  const last = new Date(y, mo, 0).getDate();
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const end = `${y}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
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
    newCustomersToday: null,
    bookingsToday: null,
    bookingsThisMonth: null,
    revenueThisMonth: null,
    revenueToday: null,
  };

  if (!db || !siteId) return result;

  const today = getDateYMDInTimezone(new Date(), SITE_DAY_TZ);
  const { start: monthStart, end: monthEnd } = monthYmdBoundsContainingDay(today);
  const [iy, im] = today.split("-").map(Number);
  const clientMonthStart = new Date(iy, im - 1, 1, 0, 0, 0, 0);
  const clientMonthNext = new Date(iy, im, 1, 0, 0, 0, 0);
  const monthStartTs = Timestamp.fromDate(clientMonthStart);
  const monthNextTs = Timestamp.fromDate(clientMonthNext);
  const { start: dayStartMs, endExclusive: dayEndExclusiveMs } = zonedDayRangeEpochMs(today, SITE_DAY_TZ);
  const dayStartTs = Timestamp.fromMillis(dayStartMs);
  const dayEndTs = Timestamp.fromMillis(dayEndExclusiveMs);

  try {
    const [clientsSnap, newCustomersSnap, newCustomersTodaySnap, monthBookingsSnap] = await Promise.all([
      getCountFromServer(query(clientsCollection(siteId))),
      getCountFromServer(
        query(
          clientsCollection(siteId),
          where("createdAt", ">=", monthStartTs),
          where("createdAt", "<", monthNextTs)
        )
      ).catch(() => null),
      getCountFromServer(
        query(
          clientsCollection(siteId),
          where("createdAt", ">=", dayStartTs),
          where("createdAt", "<", dayEndTs)
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
    result.newCustomersToday = newCustomersTodaySnap?.data().count ?? null;

    if (monthBookingsSnap) {
      let revenue = 0;
      let revenueToday = 0;
      let todayCount = 0;
      let monthVisitCount = 0;
      for (const doc of monthBookingsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (isDocCancelled(data)) continue;
        const price = numericBookingPrice(data);
        revenue += price;
        const canonicalDay = bookingDayYmdIsrael(data);
        const dateKey =
          canonicalDay.length >= 10
            ? canonicalDay
            : typeof data.dateISO === "string" && data.dateISO.length >= 10
              ? data.dateISO.slice(0, 10)
              : "";
        const followUp = isFollowUpBooking(data);
        if (!followUp) monthVisitCount += 1;
        if (dateKey === today) {
          if (!followUp) todayCount += 1;
          revenueToday += price;
        }
      }
      result.bookingsThisMonth = monthVisitCount;
      result.bookingsToday = todayCount;
      result.revenueThisMonth = revenue;
      result.revenueToday = revenueToday;
    }
  } catch (e) {
    console.warn("[fetchSiteStats]", e);
  }

  return result;
}
