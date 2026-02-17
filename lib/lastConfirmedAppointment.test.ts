/**
 * Unit tests for last confirmed past appointment resolver.
 */

import { describe, it, expect } from "vitest";
import { getLastConfirmedPastAppointment } from "./lastConfirmedAppointment";

function booking(opts: {
  date: string;
  time?: string;
  durationMin?: number;
  status?: string;
  whatsappStatus?: string;
  isArchived?: boolean;
}): Parameters<typeof getLastConfirmedPastAppointment>[0][number] {
  return {
    date: opts.date,
    time: opts.time ?? "10:00",
    durationMin: opts.durationMin ?? 60,
    status: opts.status ?? "confirmed",
    whatsappStatus: opts.whatsappStatus ?? undefined,
    isArchived: opts.isArchived ?? false,
  };
}

describe("getLastConfirmedPastAppointment", () => {
  const now = new Date(2026, 5, 15, 14, 0, 0, 0); // 2026-06-15 14:00

  it("returns null when no bookings", () => {
    const result = getLastConfirmedPastAppointment([], now);
    expect(result.lastConfirmedAt).toBeNull();
    expect(result.daysSince).toBeNull();
  });

  it("ignores future confirmed bookings", () => {
    const future = booking({ date: "2026-06-20", time: "10:00" });
    const result = getLastConfirmedPastAppointment([future], now);
    expect(result.lastConfirmedAt).toBeNull();
    expect(result.daysSince).toBeNull();
  });

  it("ignores cancelled bookings", () => {
    const cancelled = booking({ date: "2026-06-14", time: "10:00", status: "cancelled" });
    const result = getLastConfirmedPastAppointment([cancelled], now);
    expect(result.lastConfirmedAt).toBeNull();
    expect(result.daysSince).toBeNull();
  });

  it("ignores archived bookings", () => {
    const archived = booking({ date: "2026-06-14", time: "10:00", isArchived: true });
    const result = getLastConfirmedPastAppointment([archived], now);
    expect(result.lastConfirmedAt).toBeNull();
    expect(result.daysSince).toBeNull();
  });

  it("picks latest when multiple confirmed past", () => {
    const older = booking({ date: "2026-06-10", time: "09:00" });
    const newer = booking({ date: "2026-06-14", time: "11:00" });
    const result = getLastConfirmedPastAppointment([older, newer], now);
    expect(result.lastConfirmedAt).not.toBeNull();
    expect(result.lastConfirmedAt!.getFullYear()).toBe(2026);
    expect(result.lastConfirmedAt!.getMonth()).toBe(5); // June
    expect(result.lastConfirmedAt!.getDate()).toBe(14);
    expect(result.daysSince).toBe(1); // yesterday
  });

  it("same-day appointment gives daysSince 0", () => {
    const today = booking({ date: "2026-06-15", time: "09:00" }); // ended before 14:00
    const result = getLastConfirmedPastAppointment([today], now);
    expect(result.lastConfirmedAt).not.toBeNull();
    expect(result.daysSince).toBe(0);
  });

  it("yesterday gives daysSince 1", () => {
    const yesterday = booking({ date: "2026-06-14", time: "10:00" });
    const result = getLastConfirmedPastAppointment([yesterday], now);
    expect(result.daysSince).toBe(1);
  });
});
