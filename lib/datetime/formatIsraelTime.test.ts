import { describe, it, expect } from "vitest";
import {
  formatIsraelDateTime,
  formatIsraelTime,
  formatIsraelDateShort,
} from "./formatIsraelTime";

describe("formatIsraelTime", () => {
  it("formats 2026-02-11 11:45 Asia/Jerusalem as 11:45 (not 09:45 UTC)", () => {
    // 11:45 Israel = 09:45 UTC (Israel UTC+2 in winter)
    const utc = new Date("2026-02-11T09:45:00.000Z");
    expect(formatIsraelTime(utc)).toBe("11:45");
  });

  it("formats Date, ISO string, and Timestamp-like", () => {
    const utc = new Date("2026-02-11T09:45:00.000Z");
    expect(formatIsraelTime(utc)).toBe("11:45");
    expect(formatIsraelTime(utc.toISOString())).toBe("11:45");
    expect(formatIsraelTime({ toDate: () => utc })).toBe("11:45");
    expect(formatIsraelTime({ seconds: Math.floor(utc.getTime() / 1000) })).toBe("11:45");
  });
});

describe("formatIsraelDateTime", () => {
  it("returns dateStr DD/MM/YYYY and timeStr HH:mm in Israel", () => {
    const utc = new Date("2026-02-11T09:45:00.000Z");
    const { dateStr, timeStr } = formatIsraelDateTime(utc);
    expect(timeStr).toBe("11:45");
    expect(dateStr).toBe("11/02/2026");
  });
});

describe("formatIsraelDateShort", () => {
  it("returns short date in Israel timezone", () => {
    const utc = new Date("2026-02-11T09:45:00.000Z");
    const short = formatIsraelDateShort(utc);
    expect(short).toMatch(/11/);
    expect(short.length).toBeGreaterThan(0);
  });
});
