/**
 * Unit tests for closed-date (holiday) helpers.
 */

import { describe, it, expect } from "vitest";
import { isClosedDate, isBusinessClosedAllDay, normalizeDateToYYYYMMDD } from "./closedDates";
import type { BookingSettings } from "@/types/bookingSettings";

function minimalSettings(closedDates: BookingSettings["closedDates"]): BookingSettings {
  return {
    slotMinutes: 30,
    days: {
      "0": { enabled: false, start: "09:00", end: "17:00" },
      "1": { enabled: true, start: "09:00", end: "17:00" },
      "2": { enabled: true, start: "09:00", end: "17:00" },
      "3": { enabled: true, start: "09:00", end: "17:00" },
      "4": { enabled: true, start: "09:00", end: "17:00" },
      "5": { enabled: true, start: "09:00", end: "13:00" },
      "6": { enabled: false, start: "09:00", end: "17:00" },
    },
    ...(closedDates && closedDates.length > 0 ? { closedDates } : {}),
  };
}

describe("isClosedDate", () => {
  it("returns false when bookingSettings is null", () => {
    expect(isClosedDate(null, "2026-04-22")).toBe(false);
  });

  it("returns false when bookingSettings is undefined", () => {
    expect(isClosedDate(undefined, "2026-04-22")).toBe(false);
  });

  it("returns false when closedDates is missing", () => {
    const s = minimalSettings(undefined);
    expect(isClosedDate(s, "2026-04-22")).toBe(false);
  });

  it("returns false when closedDates is empty", () => {
    const s = minimalSettings([]);
    expect(isClosedDate(s, "2026-04-22")).toBe(false);
  });

  it("returns true when date is in closedDates", () => {
    const s = minimalSettings([{ date: "2026-04-22" }, { date: "2026-05-01", label: "חג" }]);
    expect(isClosedDate(s, "2026-04-22")).toBe(true);
    expect(isClosedDate(s, "2026-05-01")).toBe(true);
  });

  it("returns false when date is not in closedDates", () => {
    const s = minimalSettings([{ date: "2026-04-22" }]);
    expect(isClosedDate(s, "2026-04-21")).toBe(false);
    expect(isClosedDate(s, "2026-04-23")).toBe(false);
  });

  it("normalizes date string (trim) before matching", () => {
    const s = minimalSettings([{ date: "2026-04-22" }]);
    expect(isClosedDate(s, "  2026-04-22  ")).toBe(true);
  });

  it("returns false for invalid date format", () => {
    const s = minimalSettings([{ date: "2026-04-22" }]);
    expect(isClosedDate(s, "22-04-2026")).toBe(false);
    expect(isClosedDate(s, "2026/04/22")).toBe(false);
    expect(isClosedDate(s, "")).toBe(false);
  });
});

describe("normalizeDateToYYYYMMDD", () => {
  it("formats date as YYYY-MM-DD in local timezone", () => {
    const d = new Date(2026, 3, 22); // April 22, 2026
    expect(normalizeDateToYYYYMMDD(d)).toBe("2026-04-22");
  });

  it("pads month and day with zero", () => {
    const d = new Date(2026, 0, 5); // Jan 5
    expect(normalizeDateToYYYYMMDD(d)).toBe("2026-01-05");
  });
});

describe("isBusinessClosedAllDay", () => {
  it("returns true when date is in closedDates (holiday)", () => {
    const s = minimalSettings([{ date: "2026-04-22" }]);
    expect(isBusinessClosedAllDay({ bookingSettings: s, date: "2026-04-22" })).toBe(true);
    expect(isBusinessClosedAllDay({ bookingSettings: s, date: new Date(2026, 3, 22) })).toBe(true);
  });

  it("returns true when weekly day is disabled (e.g. Sunday)", () => {
    const s = minimalSettings(undefined);
    // 2026-04-19 is Sunday (day 0) – disabled in minimalSettings
    expect(isBusinessClosedAllDay({ bookingSettings: s, date: "2026-04-19" })).toBe(true);
  });

  it("returns true when weekly day is disabled (e.g. Saturday)", () => {
    const s = minimalSettings(undefined);
    // 2026-04-18 is Saturday (day 6) – disabled in minimalSettings
    expect(isBusinessClosedAllDay({ bookingSettings: s, date: "2026-04-18" })).toBe(true);
  });

  it("returns false when weekly day is open (e.g. Wednesday)", () => {
    const s = minimalSettings(undefined);
    // 2026-04-22 is Wednesday (day 3) – enabled 09:00–17:00
    expect(isBusinessClosedAllDay({ bookingSettings: s, date: "2026-04-22" })).toBe(false);
  });

  it("returns false for partial day (e.g. Friday 09:00–13:00)", () => {
    const s = minimalSettings(undefined);
    // 2026-04-17 is Friday (day 5) – enabled 09:00–13:00 (partial day)
    expect(isBusinessClosedAllDay({ bookingSettings: s, date: "2026-04-17" })).toBe(false);
  });

  it("returns true when bookingSettings is null", () => {
    expect(isBusinessClosedAllDay({ bookingSettings: null, date: "2026-04-22" })).toBe(true);
  });
});
