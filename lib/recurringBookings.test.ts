/**
 * Unit tests for weekly recurrence date generation.
 */

import { describe, it, expect } from "vitest";
import {
  computeWeeklyOccurrenceDates,
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
