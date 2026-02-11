import { getAdminDb } from "./firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export interface BookingData {
  id: string;
  dateISO: string; // YYYY-MM-DD
  timeHHmm: string; // HH:mm
  startAt: Timestamp;
  endAt?: Timestamp;
  serviceName: string;
  workerId: string | null;
  workerName: string | null;
  customerName: string;
  customerPhone: string;
  note?: string;
  price?: number;
  durationMin?: number;
}

/**
 * List all bookings for a specific date (in site timezone)
 * Handles both new format (startAt) and legacy format (dateISO/timeHHmm)
 */
export async function listBookingsForDate(
  siteId: string,
  dateISO: string
): Promise<BookingData[]> {
  console.log("[listBookingsForDate] querying", { siteId, dateISO });

  try {
    // Parse dateISO to get start/end of day in local timezone
    const [year, month, day] = dateISO.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    console.log("[listBookingsForDate] date range", {
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
    });

    const adminDb = getAdminDb();
    const bookingsRef = adminDb
      .collection("sites")
      .doc(siteId)
      .collection("bookings");

    // Try primary query: by startAt (new format)
    let bookings: BookingData[] = [];
    let usedFallback = false;

    try {
      const startAtQuery = bookingsRef
        .where("startAt", ">=", Timestamp.fromDate(startOfDay))
        .where("startAt", "<=", Timestamp.fromDate(endOfDay))
        .orderBy("startAt", "asc");

      const startAtSnapshot = await startAtQuery.get();
      console.log("[listBookingsForDate] startAt query returned", startAtSnapshot.docs.length, "docs");

      bookings = startAtSnapshot.docs
        .filter((doc) => doc.data().isArchived !== true)
        .map((doc) => {
        const data = doc.data();
        const startAt = data.startAt?.toDate() || new Date();
        return {
          id: doc.id,
          dateISO: data.dateISO || data.date || dateISO,
          timeHHmm: data.timeHHmm || data.time || startAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
          startAt: data.startAt || Timestamp.fromDate(startAt),
          endAt: data.endAt,
          serviceName: data.serviceName || data.service || "",
          workerId: data.workerId || null,
          workerName: data.workerName || "",
          customerName: data.customerName || data.clientName || data.name || "",
          customerPhone: data.customerPhone || data.phone || "",
          note: data.note || "",
          price: data.price || 0,
          durationMin: data.durationMin || 60,
        };
      });
    } catch (err: any) {
      // If startAt query fails (missing index or no startAt field), use fallback
      console.warn("[listBookingsForDate] startAt query failed, using fallback", err.message);
      usedFallback = true;
    }

    // Fallback query: by dateISO (legacy format)
    if (usedFallback || bookings.length === 0) {
      try {
        const dateQuery = bookingsRef
          .where("dateISO", "==", dateISO)
          .orderBy("timeHHmm", "asc");

        const dateSnapshot = await dateQuery.get();
        console.log("[listBookingsForDate] dateISO fallback query returned", dateSnapshot.docs.length, "docs");

        // Also try legacy "date" field
        const legacyDateQuery = bookingsRef
          .where("date", "==", dateISO)
          .orderBy("time", "asc");

        const legacySnapshot = await legacyDateQuery.get();
        console.log("[listBookingsForDate] legacy date query returned", legacySnapshot.docs.length, "docs");

        // Merge results, avoiding duplicates
        const seenIds = new Set(bookings.map((b) => b.id));

        const processDoc = (doc: any): BookingData => {
          const data = doc.data();
          const dateStr = data.dateISO || data.date || dateISO;
          const timeStr = data.timeHHmm || data.time || "";
          
          // Build startAt from dateISO + timeHHmm if missing
          let startAt: Timestamp;
          if (data.startAt) {
            startAt = data.startAt;
          } else if (dateStr && timeStr) {
            const [y, m, d] = dateStr.split("-").map(Number);
            const [hh, mm] = timeStr.split(":").map(Number);
            const startDate = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
            startAt = Timestamp.fromDate(startDate);
          } else {
            startAt = Timestamp.now();
          }

          return {
            id: doc.id,
            dateISO: dateStr,
            timeHHmm: timeStr,
            startAt,
            endAt: data.endAt,
            serviceName: data.serviceName || data.service || "",
            workerId: data.workerId || null,
            workerName: data.workerName || "",
            customerName: data.customerName || data.clientName || data.name || "",
            customerPhone: data.customerPhone || data.phone || "",
            note: data.note || "",
            price: data.price || 0,
            durationMin: data.durationMin || 60,
          };
        };

        dateSnapshot.docs.forEach((doc) => {
          if (doc.data().isArchived === true || seenIds.has(doc.id)) return;
          bookings.push(processDoc(doc));
          seenIds.add(doc.id);
        });

        legacySnapshot.docs.forEach((doc) => {
          if (doc.data().isArchived === true || seenIds.has(doc.id)) return;
          bookings.push(processDoc(doc));
          seenIds.add(doc.id);
        });
      } catch (fallbackErr: any) {
        console.error("[listBookingsForDate] fallback query also failed", fallbackErr.message);
      }
    }

    // Sort by startAt or time
    bookings.sort((a, b) => {
      const aTime = a.startAt.toMillis();
      const bTime = b.startAt.toMillis();
      return aTime - bTime;
    });

    console.log("[listBookingsForDate] final result", {
      siteId,
      dateISO,
      count: bookings.length,
      usedFallback,
    });

    return bookings;
  } catch (err) {
    console.error("[listBookingsForDate] error", err);
    return [];
  }
}
