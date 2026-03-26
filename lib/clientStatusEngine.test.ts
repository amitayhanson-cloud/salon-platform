import { describe, expect, it } from "vitest";
import { calculateAutomatedClientStatus } from "./clientStatusEngine";

const defaultRules = {
  newMaxTotalBookings: 2,
  activeMinBookings: 2,
  activeWindowDays: 30,
  sleepingNoBookingsFor: 60,
  sleepingWindowUnit: "days" as const,
};

describe("calculateAutomatedClientStatus", () => {
  it("new when no qualifying booking history", () => {
    expect(calculateAutomatedClientStatus([], defaultRules, new Date("2025-06-01"))).toBe("new");
  });

  it("new when at least one visit but below lifetime threshold (past visits)", () => {
    const bookings = [{ date: "2025-05-01", time: "10:00", status: "booked" }];
    expect(calculateAutomatedClientStatus(bookings, defaultRules, new Date("2025-06-01"))).toBe("new");
  });

  it("active only from past visits in window — future appointments do not count", () => {
    const now = new Date("2025-03-15T12:00:00");
    const bookings = [
      { date: "2025-03-20", time: "10:00", status: "booked" },
      { date: "2025-03-25", time: "11:00", status: "booked" },
    ];
    expect(calculateAutomatedClientStatus(bookings, defaultRules, now)).toBe("normal");
  });

  it("active when enough past visits fall inside active window", () => {
    const now = new Date("2025-03-15T12:00:00");
    const bookings = [
      { date: "2025-03-10", time: "10:00", status: "booked" },
      { date: "2025-03-12", time: "11:00", status: "booked" },
    ];
    expect(calculateAutomatedClientStatus(bookings, defaultRules, now)).toBe("active");
  });

  it("sleeping when enough lifetime visits but none in sleeping window", () => {
    const now = new Date("2025-06-01T12:00:00");
    const bookings = [
      { date: "2025-01-01", time: "10:00", status: "booked" },
      { date: "2025-01-02", time: "10:00", status: "booked" },
    ];
    expect(calculateAutomatedClientStatus(bookings, defaultRules, now)).toBe("sleeping");
  });

  it("excludes cancelled and whatsapp cancelled from counts", () => {
    const now = new Date("2025-03-15T12:00:00");
    const bookings = [
      { date: "2025-03-10", time: "10:00", status: "cancelled" },
      { date: "2025-03-11", time: "10:00", status: "booked", whatsappStatus: "cancelled" },
      { date: "2025-03-12", time: "11:00", status: "booked" },
    ];
    expect(calculateAutomatedClientStatus(bookings, defaultRules, now)).toBe("new");
  });

  it("future-only with one upcoming is new when below threshold", () => {
    const now = new Date("2025-03-15T12:00:00");
    const bookings = [{ date: "2025-03-20", time: "10:00", status: "booked" }];
    expect(calculateAutomatedClientStatus(bookings, defaultRules, now)).toBe("new");
  });
});
