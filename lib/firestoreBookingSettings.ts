import { db } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import type { SalonBookingState } from "@/types/booking";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

export function bookingSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "booking");
}

export async function ensureBookingSettings(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  const ref = bookingSettingsDoc(siteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const sanitized = sanitizeForFirestore(defaultBookingSettings) as BookingSettings;
    await setDoc(ref, sanitized);
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
      const merged = { ...defaultBookingSettings, ...data };
      // Client types live in settings/clients only; do not expose from booking doc
      delete (merged as Record<string, unknown>).clientTypes;
      onData(merged);
    },
    (err) => onError?.(err)
  );
}

export async function saveBookingSettings(siteId: string, settings: BookingSettings) {
  if (!db) throw new Error("Firestore db not initialized");
  const sanitized = sanitizeForFirestore(settings) as BookingSettings;
  if (process.env.NODE_ENV !== "production") {
    console.log("[Admin] saveBookingSettings raw payload:", JSON.stringify(settings, null, 2));
    console.log("[Admin] saveBookingSettings sanitized payload:", JSON.stringify(sanitized, null, 2));
  }
  await setDoc(bookingSettingsDoc(siteId), sanitized, { merge: true });
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

  const days: Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { enabled: boolean; start: string; end: string; breaks?: { start: string; end: string }[] }> = {
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
      const dayEntry: { enabled: boolean; start: string; end: string; breaks?: { start: string; end: string }[] } = {
        enabled: day.open !== null && day.close !== null,
        start: day.open || "09:00",
        end: day.close || "17:00",
      };
      if (day.breaks && day.breaks.length > 0) {
        dayEntry.breaks = day.breaks.map((b) => ({ start: b.start, end: b.end }));
      }
      days[numericKey] = dayEntry;
    }
  }

  const closedDates: NonNullable<BookingSettings["closedDates"]> =
    state.closedDates && state.closedDates.length > 0
      ? (() => {
          const seen = new Set<string>();
          const entries: NonNullable<BookingSettings["closedDates"]> = [];
          for (const e of state.closedDates) {
            if (!e?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date).trim())) continue;
            const date = String(e.date).trim();
            if (seen.has(date)) continue;
            seen.add(date);
            const labelTrim = e.label != null ? String(e.label).trim() : "";
            const entry: { date: string; label?: string } = { date };
            if (labelTrim !== "") entry.label = labelTrim;
            entries.push(entry);
          }
          entries.sort((a, b) => a.date.localeCompare(b.date));
          return entries;
        })()
      : [];

  return {
    slotMinutes: state.defaultSlotMinutes || 30,
    days,
    closedDates,
  };
}
