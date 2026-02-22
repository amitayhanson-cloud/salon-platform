/**
 * Unit tests for schedule day mapping (Monday/Saturday/Sunday).
 */

import { describe, it, expect } from "vitest";
import {
  getJsDow,
  getJsDayIndexForDate,
  getBookingScheduleDayKey,
  getDayConfig,
  getDaySchedule,
  jsDayToWeekdayKey,
  JS_DAY_TO_WEEKDAY_KEY,
} from "./scheduleDayMapping";

const allDaysOpen = {
  "0": { enabled: true, start: "09:00", end: "17:00" },
  "1": { enabled: true, start: "09:00", end: "17:00" },
  "2": { enabled: true, start: "09:00", end: "17:00" },
  "3": { enabled: true, start: "09:00", end: "17:00" },
  "4": { enabled: true, start: "09:00", end: "17:00" },
  "5": { enabled: true, start: "09:00", end: "17:00" },
  "6": { enabled: true, start: "09:00", end: "17:00" },
} as const;

const onlyMondayOpen = {
  "0": { enabled: false, start: "09:00", end: "17:00" },
  "1": { enabled: true, start: "09:00", end: "17:00" },
  "2": { enabled: false, start: "09:00", end: "17:00" },
  "3": { enabled: false, start: "09:00", end: "17:00" },
  "4": { enabled: false, start: "09:00", end: "17:00" },
  "5": { enabled: false, start: "09:00", end: "17:00" },
  "6": { enabled: false, start: "09:00", end: "17:00" },
} as const;

describe("scheduleDayMapping", () => {
  it("Monday returns day key 1", () => {
    const monday = new Date(2026, 1, 16, 12, 0, 0); // Feb 16, 2026
    expect(monday.getDay()).toBe(1);
    expect(getJsDayIndexForDate(monday)).toBe(1);
    expect(getBookingScheduleDayKey(monday)).toBe("1");
    expect(jsDayToWeekdayKey(1)).toBe("mon");
  });

  it("Saturday returns day key 6", () => {
    const saturday = new Date(2026, 1, 21, 12, 0, 0); // Feb 21, 2026
    expect(saturday.getDay()).toBe(6);
    expect(getJsDayIndexForDate(saturday)).toBe(6);
    expect(getBookingScheduleDayKey(saturday)).toBe("6");
    expect(jsDayToWeekdayKey(6)).toBe("sat");
  });

  it("Sunday returns day key 0", () => {
    const sunday = new Date(2026, 1, 15, 12, 0, 0); // Feb 15, 2026
    expect(sunday.getDay()).toBe(0);
    expect(getJsDayIndexForDate(sunday)).toBe(0);
    expect(getBookingScheduleDayKey(sunday)).toBe("0");
    expect(jsDayToWeekdayKey(0)).toBe("sun");
  });

  it("JS_DAY_TO_WEEKDAY_KEY maps all days correctly", () => {
    expect(JS_DAY_TO_WEEKDAY_KEY[0]).toBe("sun");
    expect(JS_DAY_TO_WEEKDAY_KEY[1]).toBe("mon");
    expect(JS_DAY_TO_WEEKDAY_KEY[2]).toBe("tue");
    expect(JS_DAY_TO_WEEKDAY_KEY[3]).toBe("wed");
    expect(JS_DAY_TO_WEEKDAY_KEY[4]).toBe("thu");
    expect(JS_DAY_TO_WEEKDAY_KEY[5]).toBe("fri");
    expect(JS_DAY_TO_WEEKDAY_KEY[6]).toBe("sat");
  });

  it("with timezone Asia/Jerusalem returns correct weekday", () => {
    const monday = new Date(2026, 1, 16, 12, 0, 0);
    expect(getJsDayIndexForDate(monday, "Asia/Jerusalem")).toBe(1);
    expect(getBookingScheduleDayKey(monday, "Asia/Jerusalem")).toBe("1");
  });

  it("getDaySchedule: all days open - Monday and Saturday are open", () => {
    expect(getDaySchedule(allDaysOpen, 1)?.enabled).toBe(true);
    expect(getDaySchedule(allDaysOpen, 6)?.enabled).toBe(true);
    expect(getDaySchedule(allDaysOpen, 0)?.enabled).toBe(true);
    expect(getDaySchedule(allDaysOpen, 3)?.enabled).toBe(true);
  });

  it("getDaySchedule: only Monday open - only Monday returns open", () => {
    expect(getDaySchedule(onlyMondayOpen, 1)?.enabled).toBe(true);
    expect(getDaySchedule(onlyMondayOpen, 6)?.enabled).toBe(false);
    expect(getDaySchedule(onlyMondayOpen, 0)?.enabled).toBe(false);
    expect(getDaySchedule(onlyMondayOpen, 3)?.enabled).toBe(false);
  });

  // Calendar "is day enabled": must use date.getDay() (local), not timezone conversion
  it("Monday March 2 2026: date.getDay() === 1, schedule.days['1'] used for enabled check", () => {
    const monday = new Date(2026, 2, 2, 12, 0, 0); // Mar 2, 2026 noon local (always Mon)
    const jsDow = monday.getDay();
    expect(jsDow).toBe(1);
    expect(getDayConfig({ days: allDaysOpen }, jsDow)?.enabled).toBe(true);
  });
});
