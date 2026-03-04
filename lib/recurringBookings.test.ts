/**
 * Unit tests for recurrence date generation (weekly + extended frequency).
 */

import { describe, it, expect } from "vitest";
import {
  computeWeeklyOccurrenceDates,
  computeRecurrenceOccurrenceDates,
  getRecurrenceFrequencyLabel,
  MAX_RECURRING_OCCURRENCES,
} from "./recurringBookings";

describe("computeWeeklyOccurrenceDates", () => {
  it("returns correct count when mode is count", () => {
    const result = computeWeeklyOccurrenceDates("2025-02-15", "10:00", {
      count: 8,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual({ date: "2025-02-15", time: "10:00" });
    expect(result[1]).toEqual({ date: "2025-02-22", time: "10:00" });
    expect(result[2]).toEqual({ date: "2025-03-01", time: "10:00" });
    expect(result[7]).toEqual({ date: "2025-04-05", time: "10:00" });
  });

  it("preserves time for all occurrences", () => {
    const result = computeWeeklyOccurrenceDates("2025-02-15", "14:30", {
      count: 3,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
    expect(result.every((o) => o.time === "14:30")).toBe(true);
    expect(result.map((o) => o.date)).toEqual(["2025-02-15", "2025-02-22", "2025-03-01"]);
  });

  it("stops at endDate when mode is endDate", () => {
    const result = computeWeeklyOccurrenceDates("2025-02-15", "09:00", {
      endDate: "2025-03-15",
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result[0].date).toBe("2025-02-15");
    const last = result[result.length - 1]!;
    expect(last.date <= "2025-03-15").toBe(true);
    // 2025-02-15, 22, 03-01, 03-08, 03-15 = 5
    expect(result).toHaveLength(5);
    expect(last.date).toBe("2025-03-15");
  });

  it("caps at maxOccurrences", () => {
    const result = computeWeeklyOccurrenceDates("2025-02-15", "10:00", {
      count: 100,
      maxOccurrences: 60,
    });
    expect(result).toHaveLength(60);
  });

  it("returns empty when startDate is invalid", () => {
    const result = computeWeeklyOccurrenceDates("invalid", "10:00", {
      count: 5,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
    expect(result).toHaveLength(0);
  });
});

describe("computeRecurrenceOccurrenceDates", () => {
  it("weekly (unit weeks, interval 1) matches computeWeeklyOccurrenceDates exactly", () => {
    const weekly = computeWeeklyOccurrenceDates("2025-02-15", "10:00", {
      count: 8,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
    const recurrence = computeRecurrenceOccurrenceDates("2025-02-15", "10:00", {
      count: 8,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
      frequencyUnit: "weeks",
      frequencyInterval: 1,
    });
    expect(recurrence).toEqual(weekly);
    expect(recurrence).toHaveLength(8);
    expect(recurrence[0]).toEqual({ date: "2025-02-15", time: "10:00" });
    expect(recurrence[7]).toEqual({ date: "2025-04-05", time: "10:00" });
  });

  it("every 2 weeks produces correct spacing", () => {
    const result = computeRecurrenceOccurrenceDates("2025-02-15", "10:00", {
      count: 4,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
      frequencyUnit: "weeks",
      frequencyInterval: 2,
    });
    expect(result).toHaveLength(4);
    expect(result[0].date).toBe("2025-02-15");
    expect(result[1].date).toBe("2025-03-01");
    expect(result[2].date).toBe("2025-03-15");
    expect(result[3].date).toBe("2025-03-29");
  });

  it("monthly uses same day-of-month; clamps to last day when month is shorter", () => {
    const result = computeRecurrenceOccurrenceDates("2025-01-31", "09:00", {
      count: 4,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
      frequencyUnit: "months",
      frequencyInterval: 1,
    });
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ date: "2025-01-31", time: "09:00" });
    expect(result[1].date).toBe("2025-02-28"); // Feb has 28 days in 2025
    expect(result[2].date).toBe("2025-03-31");
    expect(result[3].date).toBe("2025-04-30");
  });

  it("monthly preserves same day when possible", () => {
    const result = computeRecurrenceOccurrenceDates("2025-02-15", "10:00", {
      count: 3,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
      frequencyUnit: "months",
      frequencyInterval: 1,
    });
    expect(result.map((o) => o.date)).toEqual(["2025-02-15", "2025-03-15", "2025-04-15"]);
  });

  it("default (no unit/interval) behaves as weekly", () => {
    const result = computeRecurrenceOccurrenceDates("2025-02-15", "10:00", {
      count: 3,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
    expect(result.map((o) => o.date)).toEqual(["2025-02-15", "2025-02-22", "2025-03-01"]);
  });
});

describe("getRecurrenceFrequencyLabel", () => {
  it("returns Hebrew labels for preset intervals", () => {
    expect(getRecurrenceFrequencyLabel("weeks", 1)).toBe("כל שבוע");
    expect(getRecurrenceFrequencyLabel("weeks", 2)).toBe("כל שבועיים");
    expect(getRecurrenceFrequencyLabel("weeks", 3)).toBe("כל 3 שבועות");
    expect(getRecurrenceFrequencyLabel("months", 1)).toBe("כל חודש");
    expect(getRecurrenceFrequencyLabel("weeks", 4)).toBe("כל 4 שבועות");
    expect(getRecurrenceFrequencyLabel("months", 2)).toBe("כל 2 חודשים");
  });
});
