import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
const KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

/** One row per weekday for public-site hours tables (Hebrew labels, RTL-friendly). */
export function bookingSettingsToHebrewDayRows(
  settings: BookingSettings
): { label: string; time: string }[] {
  return KEYS.map((k, i) => {
    const d = settings.days[k];
    const label = DAY_LABELS[i]!;
    if (!d?.enabled) return { label, time: "סגור" };
    const parts = [`${d.start}–${d.end}`];
    if (d.breaks?.length) {
      parts.push(
        d.breaks.map((b) => `${b.start}–${b.end}`).join(" · ")
      );
    }
    return { label, time: parts.join(" · ") };
  });
}

export function defaultHebrewOpeningRows(): { label: string; time: string }[] {
  return bookingSettingsToHebrewDayRows(defaultBookingSettings);
}
