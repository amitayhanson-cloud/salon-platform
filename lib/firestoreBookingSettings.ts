import { db } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

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

