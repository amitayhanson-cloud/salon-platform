/**
 * Unit tests for worker-specific breaks in availability.
 * Same segment-based logic as business breaks: only service segments are checked; wait gaps may cross breaks.
 */

import { describe, it, expect } from "vitest";
import { slotIsValidForNoPreference, type ChainServiceInput } from "./multiServiceChain";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";

const dateStr = "2025-02-11"; // Tuesday

function makeChainWithFollowUp(waitMin: number, part1Duration: number, part2Duration: number): ChainServiceInput[] {
  const service: SiteService = {
    id: "svc1",
    name: "תספורת",
    duration: part1Duration,
    enabled: true,
  };
  const pricingItem: PricingItem = {
    id: "price1",
    serviceId: "svc1",
    durationMinMinutes: part1Duration,
    durationMaxMinutes: part1Duration,
    hasFollowUp: true,
    followUp: {
      name: "שטיפה",
      serviceId: "svc2",
      durationMinutes: part2Duration,
      waitMinutes: waitMin,
    },
    createdAt: "",
    updatedAt: "",
  };
  return [{ service, pricingItem }];
}

describe("slotIsValidForNoPreference with workerBreaksByWorkerId", () => {
  const workerId = "worker1";
  const workers = [
    { id: workerId, name: "עובד 1", services: ["svc1", "svc2", "תספורת", "שטיפה"] },
  ];
  const workerWindowByWorkerId = { [workerId]: { startMin: 8 * 60, endMin: 20 * 60 } };
  const businessWindow = { startMin: 8 * 60, endMin: 20 * 60 };
  const bookingsForDate: unknown[] = [];
  const workerBreak12_13 = { [workerId]: [{ start: "12:00", end: "13:00" }] as { start: string; end: string }[] };

  it("allows booking when wait gap crosses worker break (part1 11:30-12:00, wait 60, part2 13:00-13:30)", () => {
    const chain = makeChainWithFollowUp(60, 30, 30);
    const startAt = new Date(2025, 1, 11, 11, 30, 0, 0); // 11:30
    const result = slotIsValidForNoPreference({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
      workerBreaksByWorkerId: workerBreak12_13,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when part1 overlaps worker break (11:45-12:15)", () => {
    const chain = makeChainWithFollowUp(60, 30, 30);
    const startAt = new Date(2025, 1, 11, 11, 45, 0, 0); // 11:45 -> part1 11:45-12:15
    const result = slotIsValidForNoPreference({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
      workerBreaksByWorkerId: workerBreak12_13,
    });
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toBe("no_available"); // worker excluded by break, so no one available
  });

  it("rejects when follow-up segment overlaps worker break (part2 12:45-13:15)", () => {
    // part1 11:15-11:45, wait 60 -> part2 12:45-13:15
    const chain = makeChainWithFollowUp(60, 30, 30);
    const startAt = new Date(2025, 1, 11, 11, 15, 0, 0);
    const result = slotIsValidForNoPreference({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
      workerBreaksByWorkerId: workerBreak12_13,
    });
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toBe("no_available");
  });

  it("allows slot when worker has no breaks (workerBreaksByWorkerId empty)", () => {
    const chain = makeChainWithFollowUp(60, 30, 30);
    const startAt = new Date(2025, 1, 11, 11, 45, 0, 0);
    const result = slotIsValidForNoPreference({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
      workerBreaksByWorkerId: { [workerId]: undefined },
    });
    expect(result.valid).toBe(true);
  });

  it("allows slot when workerBreaksByWorkerId is omitted (backward compatible)", () => {
    const chain = makeChainWithFollowUp(60, 30, 30);
    const startAt = new Date(2025, 1, 11, 11, 45, 0, 0);
    const result = slotIsValidForNoPreference({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
    });
    expect(result.valid).toBe(true);
  });
});
