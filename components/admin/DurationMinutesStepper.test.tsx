/**
 * DurationMinutesStepper — dev verification (no @testing-library in project).
 * Unit test: snapTo15 used for display and step behavior.
 *
 * Dev verification checklist:
 * - Typing into the field does nothing (input is readOnly).
 * - Clicking up increases value by 15.
 * - Clicking down decreases value by 15.
 * - Value cannot go below min (0 or prop).
 * - Values are always multiples of 15.
 */
import { describe, it, expect } from "vitest";
import { snapTo15 } from "../../lib/snapTo15";

describe("DurationMinutesStepper (snapTo15 used by stepper)", () => {
  it("snaps to multiples of 15", () => {
    expect(snapTo15(0)).toBe(0);
    expect(snapTo15(15)).toBe(15);
    expect(snapTo15(30)).toBe(30);
    expect(snapTo15(23)).toBe(30);
  });

  it("respects min option", () => {
    expect(Math.abs(snapTo15(-5, { min: 0 }))).toBe(0);
    expect(snapTo15(5, { min: 15 })).toBe(15);
  });

  it("step of 15 yields valid stepper values", () => {
    const STEP = 15;
    for (let v = 0; v <= 480; v += STEP) {
      expect(snapTo15(v)).toBe(v);
    }
  });
});
