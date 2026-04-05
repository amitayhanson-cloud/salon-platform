import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import {
  TIME_PREFERENCE_VALUES,
  type TimePreferenceValue,
} from "@/types/timePreference";

export { TIME_PREFERENCE_VALUES, type TimePreferenceValue };

/** Wall-clock buckets in site TZ: morning [08:00,12:00), afternoon [12:00,16:00), evening [16:00,20:00). */
export function timeBucketForLocalHour(hour: number): Exclude<TimePreferenceValue, "anytime"> {
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 16) return "afternoon";
  if (hour >= 16 && hour < 20) return "evening";
  if (hour < 8) return "morning";
  return "evening";
}

/**
 * Map slot start (date + HH:mm) to a preference bucket using the site's timezone.
 */
export function getTimePreferenceBucketForSlot(
  dateYmd: string,
  timeHHmm: string,
  siteTimezone: string
): Exclude<TimePreferenceValue, "anytime"> {
  const [hh, mm] = timeHHmm.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "morning";
  const wall = `${dateYmd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  try {
    const utc = fromZonedTime(wall, siteTimezone);
    const H = parseInt(formatInTimeZone(utc, siteTimezone, "H"), 10);
    if (Number.isFinite(H)) return timeBucketForLocalHour(H);
  } catch {
    /* fall through */
  }
  return "morning";
}

export function normalizeTimePreferenceArray(raw: unknown): TimePreferenceValue[] {
  const allowed = new Set<string>(TIME_PREFERENCE_VALUES);
  if (!Array.isArray(raw) || raw.length === 0) return ["anytime"];
  const out: TimePreferenceValue[] = [];
  for (const x of raw) {
    const s = String(x ?? "").trim();
    if (allowed.has(s) && (s === "morning" || s === "afternoon" || s === "evening" || s === "anytime")) {
      if (!out.includes(s as TimePreferenceValue)) out.push(s as TimePreferenceValue);
    }
  }
  if (out.length === 0) return ["anytime"];
  if (out.includes("anytime")) return ["anytime"];
  return out;
}

export function entryAcceptsTimeBucket(
  prefs: TimePreferenceValue[] | undefined | null,
  bucket: Exclude<TimePreferenceValue, "anytime">
): boolean {
  const list = normalizeTimePreferenceArray(prefs ?? ["anytime"]);
  if (list.includes("anytime")) return true;
  return list.includes(bucket);
}

const TIME_PREFERENCE_LABELS_HE: Record<TimePreferenceValue, string> = {
  morning: "בוקר",
  afternoon: "צהריים",
  evening: "ערב",
  anytime: "גמישים",
};

/** Hebrew labels for admin UI; missing/invalid data is treated like `anytime`. */
export function formatTimePreferenceLabelsHe(raw: unknown): string {
  const prefs = normalizeTimePreferenceArray(raw);
  return prefs.map((p) => TIME_PREFERENCE_LABELS_HE[p]).join(" · ");
}
