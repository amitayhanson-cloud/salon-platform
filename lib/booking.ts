import { addDoc, getDocs, query, where, orderBy, serverTimestamp, Timestamp, deleteDoc } from "firebase/firestore";
import { db } from "./firebaseClient";
import { bookingsCollection, bookingDoc } from "./firestorePaths";

export interface BookingData {
  id: string;
  serviceId: string;
  serviceName: string;
  workerId: string | null;
  workerName: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  name: string;
  phone: string;
  note?: string;
  createdAt: string; // ISO string
}

/**
 * @deprecated Use Firestore directly. Kept for backward compatibility.
 */
export function getBookings(siteId: string): BookingData[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(`bookings:${siteId}`);
    if (!raw) return [];
    return JSON.parse(raw) as BookingData[];
  } catch (e) {
    console.error("Failed to parse bookings", e);
    return [];
  }
}

/**
 * Save booking to Firestore
 */
export async function saveBooking(siteId: string, booking: Omit<BookingData, "id">): Promise<string> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  try {
    // Parse date and time to create startAt Timestamp in LOCAL time
    // Use local Date constructor to avoid timezone issues
    const [y, m, d] = booking.date.split("-").map(Number);
    const [hh, mm] = booking.time.split(":").map(Number);
    const startLocal = new Date(y, m - 1, d, hh, mm, 0, 0);
    const startAt = Timestamp.fromDate(startLocal);

    // Calculate endAt from duration
    const durationMin = 60; // Default duration
    const endLocal = new Date(startLocal.getTime() + durationMin * 60 * 1000);
    const endAt = Timestamp.fromDate(endLocal);

    const bookingsRef = bookingsCollection(siteId);
    const ref = await addDoc(bookingsRef, {
      siteId,
      serviceName: booking.serviceName,
      workerId: booking.workerId || null,
      workerName: booking.workerName || null,
      // Legacy fields (keep for backward compatibility)
      date: booking.date,
      time: booking.time,
      // New canonical fields (always present)
      dateISO: booking.date, // YYYY-MM-DD
      timeHHmm: booking.time, // HH:mm
      startAt,
      endAt,
      customerName: booking.name,
      customerPhone: booking.phone,
      note: booking.note || null,
      status: "confirmed",
      durationMin,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("[saveBooking] wrote booking", {
      siteId,
      bookingId: ref.id,
      date: booking.date,
      time: booking.time,
      workerId: booking.workerId,
    });

    return ref.id;
  } catch (e) {
    console.error("Failed to save booking to Firestore", e);
    throw e;
  }
}

/**
 * Check if a slot is taken by querying Firestore
 */
export async function isSlotTaken(
  siteId: string,
  workerId: string,
  date: string,
  time: string
): Promise<boolean> {
  if (!db) return false;

  try {
    const bookingsRef = bookingsCollection(siteId);
    const q = query(
      bookingsRef,
      where("date", "==", date),
      where("time", "==", time),
      where("workerId", "==", workerId),
      where("status", "==", "confirmed")
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (e) {
    console.error("Failed to check if slot is taken", e);
    return false;
  }
}

/**
 * Delete a booking from Firestore
 */
export async function deleteBooking(siteId: string, bookingId: string): Promise<void> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  try {
    await deleteDoc(bookingDoc(siteId, bookingId));
    console.log("[deleteBooking] deleted booking", { siteId, bookingId });
  } catch (e) {
    console.error("Failed to delete booking from Firestore", e);
    throw e;
  }
}
