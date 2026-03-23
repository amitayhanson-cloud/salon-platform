import { describe, expect, it } from "vitest";
import { firestoreBookingRecordToBookingForStatus } from "./bookingForClientStatus";
import { calculateAutomatedClientStatus } from "./clientStatusEngine";

describe("firestoreBookingRecordToBookingForStatus", () => {
  it("uses startAt when date/time strings missing", () => {
    const row = {
      startAt: { seconds: 1710741600, nanoseconds: 0 },
      status: "booked",
    };
    const b = firestoreBookingRecordToBookingForStatus(row);
    expect(b.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.time).toMatch(/^\d{2}:\d{2}$/);
    expect(b.status).toBe("booked");
  });

  it("prefers explicit dateISO and timeHHmm", () => {
    const row = {
      dateISO: "2025-06-01",
      timeHHmm: "14:30",
      startAt: { seconds: 0, nanoseconds: 0 },
      status: "confirmed",
    };
    const b = firestoreBookingRecordToBookingForStatus(row);
    expect(b.date).toBe("2025-06-01");
    expect(b.time).toBe("14:30");
  });

  it("falls back to statusAtArchive for archived history rows", () => {
    const row = {
      date: "2025-03-01",
      time: "09:00",
      statusAtArchive: "booked",
    };
    const b = firestoreBookingRecordToBookingForStatus(row);
    expect(b.status).toBe("booked");
  });
});

describe("calculateAutomatedClientStatus with startAt-only rows", () => {
  it("marks active when enough recent bookings", () => {
    const now = new Date("2025-03-15T12:00:00");
    const d1 = new Date("2025-03-10T10:00:00");
    const d2 = new Date("2025-03-12T11:00:00");
    const toSeconds = (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 });
    const bookings = [
      firestoreBookingRecordToBookingForStatus({ startAt: toSeconds(d1), status: "booked" }),
      firestoreBookingRecordToBookingForStatus({ startAt: toSeconds(d2), status: "booked" }),
    ];
    const rules = {
      newMaxTotalBookings: 2,
      activeMinBookings: 2,
      activeWindowDays: 30,
      sleepingNoBookingsFor: 60,
      sleepingWindowUnit: "days" as const,
    };
    expect(calculateAutomatedClientStatus(bookings, rules, now)).toBe("active");
  });
});
