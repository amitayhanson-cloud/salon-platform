/**
 * Server-side booking settings for sites/{siteId}/settings/booking (Admin SDK).
 */

import type { Firestore } from "firebase-admin/firestore";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

function mergeDays(
  fromFirestore: Record<string, unknown> | undefined
): BookingSettings["days"] {
  const keys = ["0", "1", "2", "3", "4", "5", "6"] as const;
  const result = { ...defaultBookingSettings.days };
  if (!fromFirestore || typeof fromFirestore !== "object") return result;
  for (const k of keys) {
    const src = (fromFirestore[k] ?? fromFirestore[String(Number(k))]) as
      | { enabled?: boolean; start?: string; end?: string }
      | undefined;
    if (src && typeof src === "object") {
      result[k] = {
        enabled: src.enabled ?? false,
        start: typeof src.start === "string" ? src.start : "09:00",
        end: typeof src.end === "string" ? src.end : "17:00",
      };
    }
  }
  return result;
}

export async function fetchBookingSettingsAdmin(
  db: Firestore,
  siteId: string
): Promise<BookingSettings> {
  const snap = await db.collection("sites").doc(siteId).collection("settings").doc("booking").get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  if (!data) return { ...defaultBookingSettings, days: mergeDays(undefined) };
  return {
    ...defaultBookingSettings,
    ...data,
    slotMinutes:
      typeof data.slotMinutes === "number" && [15, 30, 60].includes(data.slotMinutes)
        ? data.slotMinutes
        : defaultBookingSettings.slotMinutes,
    days: mergeDays(data.days as Record<string, unknown> | undefined),
  };
}
