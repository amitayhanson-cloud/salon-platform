/**
 * Unit tests for calendar date helpers (adjacentDateKey, getNextDate, getPrevDate).
 */

import { describe, it, expect } from "vitest";
import { adjacentDateKey, getNextDate, getPrevDate } from "./calendarUtils";

describe("adjacentDateKey", () => {
  it("adds one day within same month", () => {
    expect(adjacentDateKey("2025-02-23", 1)).toBe("2025-02-24");
  });

  it("subtracts one day within same month", () => {
    expect(adjacentDateKey("2025-02-23", -1)).toBe("2025-02-22");
  });

  it("crosses to next month", () => {
    expect(adjacentDateKey("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("crosses to previous month", () => {
    expect(adjacentDateKey("2025-03-01", -1)).toBe("2025-02-28");
  });

  it("crosses year boundary forward", () => {
    expect(adjacentDateKey("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("crosses year boundary backward", () => {
    expect(adjacentDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles delta 0", () => {
    expect(adjacentDateKey("2025-06-15", 0)).toBe("2025-06-15");
  });

  it("handles multiple days forward", () => {
    expect(adjacentDateKey("2025-02-23", 7)).toBe("2025-03-02");
  });

  it("handles multiple days backward", () => {
    expect(adjacentDateKey("2025-03-02", -7)).toBe("2025-02-23");
  });
});

describe("getNextDate", () => {
  it("returns next calendar day", () => {
    expect(getNextDate("2025-02-23")).toBe("2025-02-24");
  });

  it("crosses to next month", () => {
    expect(getNextDate("2025-02-28")).toBe("2025-03-01");
  });

  it("crosses year boundary", () => {
    expect(getNextDate("2025-12-31")).toBe("2026-01-01");
  });
});

describe("getPrevDate", () => {
  it("returns previous calendar day", () => {
    expect(getPrevDate("2025-02-23")).toBe("2025-02-22");
  });

  it("crosses to previous month", () => {
    expect(getPrevDate("2025-03-01")).toBe("2025-02-28");
  });

  it("crosses year boundary", () => {
    expect(getPrevDate("2026-01-01")).toBe("2025-12-31");
  });
});

describe("round-trip with fromYYYYMMDD/toYYYYMMDD", () => {
  it("getNextDate then getPrevDate returns original", () => {
    const key = "2025-07-04";
    expect(getPrevDate(getNextDate(key))).toBe(key);
  });

  it("getPrevDate then getNextDate returns original", () => {
    const key = "2025-07-04";
    expect(getNextDate(getPrevDate(key))).toBe(key);
  });
});
