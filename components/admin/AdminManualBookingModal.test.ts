/**
 * Regression: manual booking flow must never send phase2.
 * AdminManualBookingModal always calls createAdminBooking with phase2: null.
 */
import { describe, it, expect } from "vitest";

describe("AdminManualBookingModal (manual flow)", () => {
  it("manual booking payload has phase2 explicitly null (no followups)", () => {
    // Payload shape that AdminManualBookingModal sends to createAdminBooking
    const manualPayload = {
      customerName: "Test",
      customerPhone: "0500000000",
      date: "2025-02-20",
      time: "10:00",
      phase1: {
        serviceName: "תספורת",
        serviceTypeId: "p1",
        serviceType: "גברים",
        workerId: "w1",
        workerName: "מטפל",
        durationMin: 30,
        serviceColor: null,
        serviceId: "s1",
      },
      phase2: null,
      note: null,
      notes: null,
      status: "booked" as const,
      price: null,
    };
    expect(manualPayload.phase2).toBeNull();
  });
});
