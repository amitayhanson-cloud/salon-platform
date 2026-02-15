/**
 * Unit tests for business break helpers. Breaks apply only to service segments; wait gaps may cross breaks.
 */

import { describe, it, expect } from "vitest";
import {
  slotOverlapsBreaks,
  filterTimesByBreaks,
  anyServiceSegmentOverlapsBreaks,
  type BreakRange,
  type ServiceSegment,
} from "./breaks";

function toMin(hh: number, mm: number): number {
  return hh * 60 + mm;
}

describe("slotOverlapsBreaks", () => {
  const break12_13: BreakRange[] = [{ start: "12:00", end: "13:00" }];

  it("returns false when slot is entirely before break", () => {
    expect(slotOverlapsBreaks(toMin(11, 0), toMin(11, 30), break12_13)).toBe(false);
  });

  it("returns false when slot is entirely after break", () => {
    expect(slotOverlapsBreaks(toMin(13, 0), toMin(13, 30), break12_13)).toBe(false);
  });

  it("returns false when slot ends exactly at break start", () => {
    expect(slotOverlapsBreaks(toMin(11, 30), toMin(12, 0), break12_13)).toBe(false);
  });

  it("returns false when slot starts exactly at break end", () => {
    expect(slotOverlapsBreaks(toMin(13, 0), toMin(13, 30), break12_13)).toBe(false);
  });

  it("returns true when slot overlaps break (part1 overlaps)", () => {
    expect(slotOverlapsBreaks(toMin(11, 45), toMin(12, 15), break12_13)).toBe(true);
  });

  it("returns true when follow-up segment overlaps break", () => {
    expect(slotOverlapsBreaks(toMin(12, 45), toMin(13, 15), break12_13)).toBe(true);
  });

  it("returns false when breaks is empty", () => {
    expect(slotOverlapsBreaks(toMin(11, 45), toMin(12, 15), [])).toBe(false);
  });

  it("returns false when breaks is undefined", () => {
    expect(slotOverlapsBreaks(toMin(11, 45), toMin(12, 15), undefined)).toBe(false);
  });
});

describe("anyServiceSegmentOverlapsBreaks", () => {
  const break12_13: BreakRange[] = [{ start: "12:00", end: "13:00" }];

  it("allows booking when wait gap crosses break (part1 11:30-12:00, wait 60, part2 13:00-13:30)", () => {
    const segments: ServiceSegment[] = [
      { startMin: toMin(11, 30), endMin: toMin(12, 0) },
      { startMin: toMin(13, 0), endMin: toMin(13, 30) },
    ];
    expect(anyServiceSegmentOverlapsBreaks(segments, break12_13)).toBe(false);
  });

  it("rejects when part1 overlaps break (11:45-12:15)", () => {
    const segments: ServiceSegment[] = [{ startMin: toMin(11, 45), endMin: toMin(12, 15) }];
    expect(anyServiceSegmentOverlapsBreaks(segments, break12_13)).toBe(true);
  });

  it("rejects when follow-up overlaps break (12:45-13:15)", () => {
    const segments: ServiceSegment[] = [{ startMin: toMin(12, 45), endMin: toMin(13, 15) }];
    expect(anyServiceSegmentOverlapsBreaks(segments, break12_13)).toBe(true);
  });

  it("rejects when part1 and follow-up both overlap (multi-segment)", () => {
    const segments: ServiceSegment[] = [
      { startMin: toMin(11, 45), endMin: toMin(12, 15) },
      { startMin: toMin(12, 45), endMin: toMin(13, 15) },
    ];
    expect(anyServiceSegmentOverlapsBreaks(segments, break12_13)).toBe(true);
  });

  it("allows when no segment overlaps (multiple segments, gap crosses break)", () => {
    const segments: ServiceSegment[] = [
      { startMin: toMin(9, 0), endMin: toMin(9, 30) },
      { startMin: toMin(11, 30), endMin: toMin(12, 0) },
      { startMin: toMin(13, 0), endMin: toMin(13, 30) },
    ];
    expect(anyServiceSegmentOverlapsBreaks(segments, break12_13)).toBe(false);
  });

  it("returns false when breaks is empty", () => {
    const segments: ServiceSegment[] = [{ startMin: toMin(11, 45), endMin: toMin(12, 15) }];
    expect(anyServiceSegmentOverlapsBreaks(segments, [])).toBe(false);
  });

  it("returns false when breaks is undefined", () => {
    const segments: ServiceSegment[] = [{ startMin: toMin(11, 45), endMin: toMin(12, 15) }];
    expect(anyServiceSegmentOverlapsBreaks(segments, undefined)).toBe(false);
  });

  it("returns false when segments is empty", () => {
    expect(anyServiceSegmentOverlapsBreaks([], break12_13)).toBe(false);
  });

  it("rejects when segment overlaps any of multiple breaks (e.g. business + worker merged)", () => {
    const businessAndWorkerBreaks: BreakRange[] = [
      { start: "12:00", end: "13:00" },
      { start: "15:00", end: "15:30" },
    ];
    expect(anyServiceSegmentOverlapsBreaks([{ startMin: toMin(11, 30), endMin: toMin(12, 0) }], businessAndWorkerBreaks)).toBe(false);
    expect(anyServiceSegmentOverlapsBreaks([{ startMin: toMin(12, 30), endMin: toMin(12, 45) }], businessAndWorkerBreaks)).toBe(true);
    expect(anyServiceSegmentOverlapsBreaks([{ startMin: toMin(15, 10), endMin: toMin(15, 20) }], businessAndWorkerBreaks)).toBe(true);
  });
});

describe("filterTimesByBreaks", () => {
  const break12_13: BreakRange[] = [{ start: "12:00", end: "13:00" }];

  it("filters out times where full span overlaps break", () => {
    const times = ["11:00", "11:30", "12:00", "12:30", "13:00"];
    const durationMin = 60;
    const result = filterTimesByBreaks(times, durationMin, break12_13);
    expect(result).toContain("11:00");
    expect(result).not.toContain("11:30");
    expect(result).not.toContain("12:00");
    expect(result).not.toContain("12:30");
    expect(result).toContain("13:00");
  });

  it("returns all times when breaks is empty", () => {
    const times = ["11:00", "12:00"];
    expect(filterTimesByBreaks(times, 30, [])).toEqual(times);
  });
});
