import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export type BookingDTO = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  workerId: string | null;
  workerName: string | null;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  startAtMillis?: number;
  status?: string;
};

/**
 * Get bookings collection reference for a site
 */
export function bookingsCol(siteId: string) {
  const adminDb = getAdminDb();
  return adminDb.collection("sites").doc(siteId).collection("bookings");
}

/**
 * Normalize a Firestore document to BookingDTO
 */
function normalize(docSnap: any): BookingDTO {
  const data = docSnap.data();
  const startAt = data.startAt?.toDate() || null;

  return {
    id: docSnap.id,
    date: data.date || data.dateISO || (startAt ? `${startAt.getFullYear()}-${String(startAt.getMonth() + 1).padStart(2, "0")}-${String(startAt.getDate()).padStart(2, "0")}` : ""),
    time: data.time || data.timeHHmm || (startAt ? `${String(startAt.getHours()).padStart(2, "0")}:${String(startAt.getMinutes()).padStart(2, "0")}` : ""),
    workerId: data.workerId || null,
    workerName: data.workerName || "",
    serviceName: data.serviceName || data.service || "",
    customerName: data.customerName || data.clientName || data.name || "",
    customerPhone: data.customerPhone || data.phone || "",
    startAtMillis: startAt ? startAt.getTime() : undefined,
    status: data.status || "booked",
  };
}

/**
 * Strategy 1: Query by date string field (timezone-proof, exact match)
 */
export async function getBookingsByDateString(
  siteId: string,
  dateISO: string
): Promise<BookingDTO[]> {
  try {
    const snap = await bookingsCol(siteId)
      .where("date", "==", dateISO)
      .orderBy("time", "asc")
      .get();

    console.log("[getBookingsByDateString] found", snap.docs.length, "bookings for date", dateISO);
    return snap.docs.map(normalize);
  } catch (err: any) {
    console.error("[getBookingsByDateString] error", { siteId, dateISO, error: err.message });
    // If index missing, return empty and let fallback try
    return [];
  }
}

/**
 * Strategy 2: Query by startAt range (fallback)
 */
export async function getBookingsByStartAtRange(
  siteId: string,
  dateISO: string
): Promise<BookingDTO[]> {
  try {
    const [y, m, d] = dateISO.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(start);
    const endTimestamp = Timestamp.fromDate(end);

    const snap = await bookingsCol(siteId)
      .where("startAt", ">=", startTimestamp)
      .where("startAt", "<=", endTimestamp)
      .orderBy("startAt", "asc")
      .get();

    console.log("[getBookingsByStartAtRange] found", snap.docs.length, "bookings for date", dateISO);
    return snap.docs.map(normalize);
  } catch (err: any) {
    console.error("[getBookingsByStartAtRange] error", { siteId, dateISO, error: err.message });
    return [];
  }
}

/**
 * Get bookings for a day using two-strategy approach:
 * 1. Query by date string (stable, timezone-proof)
 * 2. Fallback to startAt range if date query returns 0
 */
export async function getBookingsForDay(
  siteId: string,
  dateISO: string
): Promise<BookingDTO[]> {
  console.log("[getBookingsForDay] querying", { siteId, dateISO });

  // Strategy 1: stable, timezone-proof
  const byDate = await getBookingsByDateString(siteId, dateISO);
  if (byDate.length > 0) {
    console.log("[getBookingsForDay] using date string strategy, found", byDate.length);
    return byDate;
  }

  // Strategy 2: fallback
  console.log("[getBookingsForDay] date string returned 0, trying startAt range fallback");
  const byStartAt = await getBookingsByStartAtRange(siteId, dateISO);
  console.log("[getBookingsForDay] startAt range found", byStartAt.length);
  return byStartAt;
}
