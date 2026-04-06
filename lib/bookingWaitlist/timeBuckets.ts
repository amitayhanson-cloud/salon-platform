import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import {
  TIME_PREFERENCE_VALUES,
  type TimePreferenceValue,
} from "@/types/timePreference";

export { TIME_PREFERENCE_VALUES, type TimePreferenceValue };

/**
 * Nominal waitlist time buckets (site-local wall clock, minutes from midnight).
 * Matches customer-facing copy on the book page.
 */
export const WAITLIST_BUCKET_MINUTES = {
  morning: { start: 8 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 22 * 60 },
} as const;

/** Hebrew range hints for booking UI (nominal windows; `anytime` = salon hours). */
export const WAITLIST_BUCKET_RANGE_LABELS_HE: Record<TimePreferenceValue, string> = {
  morning: "08:00–12:00",
  afternoon: "12:00–17:00",
  evening: "17:00–22:00",
  anytime: "לפי שעות הפעילות של המספרה",
};

function parseHHmmToMinutes(s: string): number | null {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 47 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

/** Minutes since local midnight in `siteTimezone` for a wall date + time. */
export function wallMinutesSinceMidnightInSiteTz(
  dateYmd: string,
  timeHHmm: string,
  siteTimezone: string
): number | null {
  const raw = String(timeHHmm ?? "").trim();
  const parts = raw.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0]!, 10);
  const mi = parseInt(String(parts[1]!).replace(/\D/g, "").slice(0, 2), 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  const hm = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  try {
    const utc = fromZonedTime(`${dateYmd}T${hm}:00`, siteTimezone);
    const hh = parseInt(formatInTimeZone(utc, siteTimezone, "H"), 10);
    const mm = parseInt(formatInTimeZone(utc, siteTimezone, "m"), 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

/** @deprecated Prefer {@link wallMinutesSinceMidnightInSiteTz} + {@link WAITLIST_BUCKET_MINUTES}. */
export function timeBucketForLocalHour(hour: number): Exclude<TimePreferenceValue, "anytime"> {
  const mins = hour * 60;
  if (mins >= WAITLIST_BUCKET_MINUTES.morning.start && mins < WAITLIST_BUCKET_MINUTES.morning.end) {
    return "morning";
  }
  if (mins >= WAITLIST_BUCKET_MINUTES.afternoon.start && mins < WAITLIST_BUCKET_MINUTES.afternoon.end) {
    return "afternoon";
  }
  if (mins >= WAITLIST_BUCKET_MINUTES.evening.start && mins < WAITLIST_BUCKET_MINUTES.evening.end) {
    return "evening";
  }
  if (hour < 8) return "morning";
  return "evening";
}

/**
 * Map slot start (date + HH:mm) to a preference bucket using the site's timezone.
 * Times outside 08:00–22:00 map to nearest edge label for horizon hints only; matching uses
 * {@link waitlistOfferStartRespectsPrefsAndSalon}.
 */
export function getTimePreferenceBucketForSlot(
  dateYmd: string,
  timeHHmm: string,
  siteTimezone: string
): Exclude<TimePreferenceValue, "anytime"> {
  const mins = wallMinutesSinceMidnightInSiteTz(dateYmd, timeHHmm, siteTimezone);
  if (mins == null) return "morning";
  if (mins >= WAITLIST_BUCKET_MINUTES.morning.start && mins < WAITLIST_BUCKET_MINUTES.morning.end) {
    return "morning";
  }
  if (mins >= WAITLIST_BUCKET_MINUTES.afternoon.start && mins < WAITLIST_BUCKET_MINUTES.afternoon.end) {
    return "afternoon";
  }
  if (mins >= WAITLIST_BUCKET_MINUTES.evening.start && mins < WAITLIST_BUCKET_MINUTES.evening.end) {
    return "evening";
  }
  if (mins < WAITLIST_BUCKET_MINUTES.morning.start) return "morning";
  return "evening";
}

/**
 * Strict rules: not in the past; inside salon hours; if not `anytime`, start must fall in a selected
 * nominal bucket window (08–12 / 12–17 / 17–22 site-local).
 */
export function waitlistOfferStartRespectsPrefsAndSalon(
  prefs: unknown,
  dateYmd: string,
  timeHHmm: string,
  siteTz: string,
  salonDay: { enabled: boolean; start: string; end: string },
  nowMs: number
): { ok: true } | { ok: false; reason: string } {
  const hm = String(timeHHmm ?? "").trim();
  const hm5 = hm.length >= 5 ? hm.slice(0, 5) : hm;
  let startMs: number;
  try {
    startMs = fromZonedTime(`${dateYmd}T${hm5}:00`, siteTz).getTime();
  } catch {
    return { ok: false, reason: "offer_wall_time_invalid" };
  }
  if (!Number.isFinite(startMs)) {
    return { ok: false, reason: "offer_wall_time_invalid" };
  }
  if (startMs < nowMs) {
    return { ok: false, reason: "offer_start_in_past" };
  }

  const wm = wallMinutesSinceMidnightInSiteTz(dateYmd, timeHHmm, siteTz);
  if (wm == null) {
    return { ok: false, reason: "offer_wall_time_invalid" };
  }

  if (!salonDay.enabled) {
    return { ok: false, reason: "salon_closed_that_day" };
  }

  const openM = parseHHmmToMinutes(salonDay.start);
  const closeM = parseHHmmToMinutes(salonDay.end);
  if (openM == null || closeM == null || closeM <= openM) {
    return { ok: false, reason: "salon_hours_invalid" };
  }
  if (wm < openM || wm >= closeM) {
    return { ok: false, reason: "outside_salon_hours" };
  }

  const list = normalizeTimePreferenceArray(prefs);
  if (list.includes("anytime")) {
    return { ok: true };
  }

  for (const p of list) {
    if (p === "morning") {
      if (wm >= WAITLIST_BUCKET_MINUTES.morning.start && wm < WAITLIST_BUCKET_MINUTES.morning.end) {
        return { ok: true };
      }
    }
    if (p === "afternoon") {
      if (wm >= WAITLIST_BUCKET_MINUTES.afternoon.start && wm < WAITLIST_BUCKET_MINUTES.afternoon.end) {
        return { ok: true };
      }
    }
    if (p === "evening") {
      if (wm >= WAITLIST_BUCKET_MINUTES.evening.start && wm < WAITLIST_BUCKET_MINUTES.evening.end) {
        return { ok: true };
      }
    }
  }

  return { ok: false, reason: "outside_preferred_time_bucket" };
}

/** Add minutes to a wall time in `timeZone` (correct around DST in that zone). */
export function addWallMinutesInTimezone(
  dateYmd: string,
  timeHHmm: string,
  deltaMinutes: number,
  timeZone: string
): { dateYmd: string; timeHHmm: string } | null {
  const t = timeHHmm.trim();
  const hm = t.length >= 5 ? t.slice(0, 5) : t;
  const wall = `${dateYmd}T${hm}:00`;
  try {
    const utc = fromZonedTime(wall, timeZone);
    const next = addMinutes(utc, deltaMinutes);
    return {
      dateYmd: formatInTimeZone(next, timeZone, "yyyy-MM-dd"),
      timeHHmm: formatInTimeZone(next, timeZone, "HH:mm"),
    };
  } catch {
    return null;
  }
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
