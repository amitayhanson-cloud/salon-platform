/**
 * Reset all workers' availability to match business hours.
 * Called when admin saves business hours so booking page shows correct open days.
 */

import { getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { workersCollection, workerDoc } from "@/lib/firestorePaths";
import type { BookingSettings } from "@/types/bookingSettings";
import type { OpeningHours } from "@/types/booking";

const BATCH_SIZE = 500; // Firestore limit

const NUMERIC_TO_WEEKDAY: Record<string, "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"> = {
  "0": "sun",
  "1": "mon",
  "2": "tue",
  "3": "wed",
  "4": "thu",
  "5": "fri",
  "6": "sat",
};

const DAY_LABELS: Record<string, string> = {
  sun: "ראשון",
  mon: "שני",
  tue: "שלישי",
  wed: "רביעי",
  thu: "חמישי",
  fri: "שישי",
  sat: "שבת",
};

/** Convert BookingSettings.days to OpeningHours[] for worker availability. */
function businessDaysToOpeningHours(days: BookingSettings["days"]): OpeningHours[] {
  const keys: ("0" | "1" | "2" | "3" | "4" | "5" | "6")[] = ["0", "1", "2", "3", "4", "5", "6"];
  return keys.map((numericKey) => {
    const day = days[numericKey];
    const weekday = NUMERIC_TO_WEEKDAY[numericKey] ?? "sun";
    const enabled = !!day?.enabled;
    const start = typeof day?.start === "string" ? day.start : "09:00";
    const end = typeof day?.end === "string" ? day.end : "17:00";
    const breaks = day?.breaks && Array.isArray(day.breaks) && day.breaks.length > 0
      ? day.breaks.filter(
          (b): b is { start: string; end: string } =>
            !!b && typeof b.start === "string" && typeof b.end === "string"
        )
      : undefined;
    return {
      day: weekday,
      label: DAY_LABELS[weekday] ?? weekday,
      open: enabled ? start : null,
      close: enabled ? end : null,
      ...(breaks?.length ? { breaks } : {}),
    };
  });
}

/**
 * Reset every worker's availability to match business hours.
 * Uses batched writes for >500 workers.
 */
export async function resetWorkersAvailabilityToBusinessHours(
  siteId: string,
  bookingSettings: BookingSettings
): Promise<{ updatedCount: number }> {
  const firestore = db;
  if (!firestore) throw new Error("Firestore db not initialized");
  const availability = businessDaysToOpeningHours(bookingSettings.days);
  const col = workersCollection(siteId);
  const snapshot = await getDocs(col);
  const workerIds: string[] = [];
  snapshot.forEach((doc) => workerIds.push(doc.id));

  let updatedCount = 0;
  if (workerIds.length === 0) {
    return { updatedCount: 0 };
  }

  const payload = {
    availability,
    workersAvailabilitySyncedAt: serverTimestamp(),
  };

  for (let i = 0; i < workerIds.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestore);
    const chunk = workerIds.slice(i, i + BATCH_SIZE);
    for (const workerId of chunk) {
      batch.update(workerDoc(siteId, workerId), payload);
      updatedCount++;
    }
    await batch.commit();
  }

  if (
    typeof process !== "undefined" &&
    process.env?.NEXT_PUBLIC_DEBUG_BOOKING === "true"
  ) {
    console.log("[Admin] resetWorkersAvailabilityToBusinessHours", {
      siteId,
      updatedCount,
    });
  }

  return { updatedCount };
}
