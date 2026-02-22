/**
 * Unit tests for expired cleanup logic.
 */

import { describe, it, expect } from "vitest";
import { isFollowUpBooking } from "./normalizeBooking";
import { getDateYMDInTimezone } from "./expiredCleanupUtils";
import { isBookingDateInPast } from "./validateBookingDate";

describe("expiredCleanupUtils", () => {
  describe("getDateYMDInTimezone", () => {
    it("returns YYYY-MM-DD in Asia/Jerusalem", () => {
      const d = new Date("2026-02-17T02:00:00Z");
      const ymd = getDateYMDInTimezone(d, "Asia/Jerusalem");
      expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ymd).toBe("2026-02-17");
    });

    it("date boundary: UTC midnight can be different day in Jerusalem", () => {
      const utcMidnight = new Date("2026-02-17T00:00:00Z");
      const ymd = getDateYMDInTimezone(utcMidnight, "Asia/Jerusalem");
      expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Jerusalem is UTC+2 in Feb; 00:00 UTC = 02:00 Jerusalem same calendar day
      expect(ymd).toBe("2026-02-17");
    });

    it("invalid timezone falls back to ISO slice", () => {
      const d = new Date("2026-02-17T12:00:00Z");
      const ymd = getDateYMDInTimezone(d, "Invalid/Timezone");
      expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });
});

describe("validateBookingDate", () => {
  it("isBookingDateInPast: past date is rejected", () => {
    const today = new Date();
    const todayStr = getDateYMDInTimezone(today, "Asia/Jerusalem");
    const [y, m, d] = todayStr.split("-").map(Number);
    const yesterday = new Date(y, m - 1, d - 1);
    const yesterdayStr = getDateYMDInTimezone(yesterday, "Asia/Jerusalem");
    expect(isBookingDateInPast("Asia/Jerusalem", yesterdayStr)).toBe(true);
  });

  it("isBookingDateInPast: today is not rejected", () => {
    const todayStr = getDateYMDInTimezone(new Date(), "Asia/Jerusalem");
    expect(isBookingDateInPast("Asia/Jerusalem", todayStr)).toBe(false);
  });

  it("isBookingDateInPast: future date is not rejected", () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getDateYMDInTimezone(tomorrow, "Asia/Jerusalem");
    expect(isBookingDateInPast("Asia/Jerusalem", tomorrowStr)).toBe(false);
  });
});

describe("isFollowUpBooking", () => {
  it("returns true when parentBookingId is set", () => {
    expect(isFollowUpBooking({ parentBookingId: "abc123" })).toBe(true);
    expect(isFollowUpBooking({ parentBookingId: "  x  " })).toBe(true);
  });

  it("returns false when parentBookingId is missing or empty", () => {
    expect(isFollowUpBooking({})).toBe(false);
    expect(isFollowUpBooking({ parentBookingId: null })).toBe(false);
    expect(isFollowUpBooking({ parentBookingId: "" })).toBe(false);
    expect(isFollowUpBooking({ parentBookingId: "   " })).toBe(false);
  });

  it("follow-up booking should not be archived (logic used by cleanup)", () => {
    const followUp = { parentBookingId: "main1", serviceName: "Follow-up" };
    expect(isFollowUpBooking(followUp)).toBe(true);
  });
});
