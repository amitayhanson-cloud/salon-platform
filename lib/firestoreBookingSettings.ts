import { db } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import type { SalonBookingState } from "@/types/booking";

export function bookingSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "booking");
}

export async function ensureBookingSettings(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  const ref = bookingSettingsDoc(siteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, defaultBookingSettings);
  }
}

export function subscribeBookingSettings(
  siteId: string,
  onData: (s: BookingSettings) => void,
  onError?: (e: unknown) => void
) {
  if (!db) throw new Error("Firestore db not initialized");
  return onSnapshot(
    bookingSettingsDoc(siteId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as BookingSettings) : defaultBookingSettings;
      onData({ ...defaultBookingSettings, ...data });
    },
    (err) => onError?.(err)
  );
}

export async function saveBookingSettings(siteId: string, settings: BookingSettings) {
  if (!db) throw new Error("Firestore db not initialized");
  await setDoc(bookingSettingsDoc(siteId), settings, { merge: true });
}

/**
 * Convert SalonBookingState (admin UI format) to BookingSettings (Firestore format)
 * SalonBookingState uses Weekday keys ("sun", "mon", etc.) in an array
 * BookingSettings uses numeric keys ("0", "1", etc.) where 0=Sunday, 6=Saturday
 */
export function convertSalonBookingStateToBookingSettings(
  state: SalonBookingState
): BookingSettings {
  // Map Weekday to numeric key (matching JavaScript getDay())
  const weekdayToNumeric: Record<string, "0" | "1" | "2" | "3" | "4" | "5" | "6"> = {
    sun: "0",
    mon: "1",
    tue: "2",
    wed: "3",
    thu: "4",
    fri: "5",
    sat: "6",
  };

  const days: Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { enabled: boolean; start: string; end: string }> = {
    "0": { enabled: false, start: "09:00", end: "17:00" },
    "1": { enabled: false, start: "09:00", end: "17:00" },
    "2": { enabled: false, start: "09:00", end: "17:00" },
    "3": { enabled: false, start: "09:00", end: "17:00" },
    "4": { enabled: false, start: "09:00", end: "17:00" },
    "5": { enabled: false, start: "09:00", end: "17:00" },
    "6": { enabled: false, start: "09:00", end: "17:00" },
  };

  // Convert each day from SalonBookingState format
  for (const day of state.openingHours) {
    const numericKey = weekdayToNumeric[day.day];
    if (numericKey) {
      days[numericKey] = {
        enabled: day.open !== null && day.close !== null,
        start: day.open || "09:00",
        end: day.close || "17:00",
      };
    }
  }

  return {
    slotMinutes: state.defaultSlotMinutes || 30,
    days,
  };
}
