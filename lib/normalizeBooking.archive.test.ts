import { describe, it, expect } from "vitest";
import { isBookingArchived, isBookingCancelled, normalizeBooking } from "./normalizeBooking";

describe("isBookingArchived", () => {
  it("returns true when isArchived is true", () => {
    expect(isBookingArchived({ isArchived: true })).toBe(true);
  });

  it("returns false when isArchived is false or missing", () => {
    expect(isBookingArchived({ isArchived: false })).toBe(false);
    expect(isBookingArchived({})).toBe(false);
  });
});

describe("archived booking not on calendar, visible in history", () => {
  it("normalized booking with isArchived true has isArchived set", () => {
    const doc = {
      id: "b1",
      data: () =>
        ({
          date: "2026-02-05",
          dateISO: "2026-02-05",
          time: "10:00",
          timeHHmm: "10:00",
          status: "confirmed",
          isArchived: true,
          archivedReason: "manual",
        }) as Record<string, unknown>,
    };
    const out = normalizeBooking(doc as { id: string; data: () => Record<string, unknown> });
    expect(isBookingArchived(out)).toBe(true);
    expect(out.isArchived).toBe(true);
    expect(out.archivedReason).toBe("manual");
  });

  it("normalized booking without isArchived is treated as active", () => {
    const doc = {
      id: "b2",
      data: () =>
        ({
          date: "2026-02-05",
          dateISO: "2026-02-05",
          time: "10:00",
          timeHHmm: "10:00",
          status: "confirmed",
        }) as Record<string, unknown>,
    };
    const out = normalizeBooking(doc as { id: string; data: () => Record<string, unknown> });
    expect(isBookingArchived(out)).toBe(false);
  });
});
