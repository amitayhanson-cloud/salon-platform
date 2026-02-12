/**
 * Regression tests for worker–service assignment (phase 1 + phase 2 follow-up).
 * Ensures follow-up services are assigned to workers who can perform them; no inheritance of main worker when they can't.
 */
import { describe, it, expect } from "vitest";
import { workerCanDoService, canWorkerPerformService } from "./workerServiceCompatibility";
import {
  resolveChainWorkers,
  repairInvalidAssignments,
  validateChainAssignments,
  slotIsValidForNoPreference,
} from "./multiServiceChain";
import type { ChainServiceInput } from "./multiServiceChain";

describe("workerCanDoService / canWorkerPerformService", () => {
  it("returns true when worker.services includes service name (workers page stores names)", () => {
    const worker = { id: "w1", name: "Avi", services: ["גוונים", "פן"], active: true };
    expect(canWorkerPerformService(worker, "גוונים")).toBe(true);
    expect(canWorkerPerformService(worker, "פן")).toBe(true);
    expect(workerCanDoService(worker, "גוונים")).toBe(true);
  });

  it("returns false when worker cannot do service", () => {
    const worker = { id: "w1", name: "Avi", services: ["גוונים"], active: true };
    expect(canWorkerPerformService(worker, "פן")).toBe(false);
    expect(workerCanDoService(worker, "פן")).toBe(false);
  });

  it("normalizes string/number so '3' and 3 match", () => {
    const worker = { id: "w1", name: "Avi", services: [3, "גוונים"], active: true };
    expect(canWorkerPerformService(worker, "3")).toBe(true);
    expect(canWorkerPerformService(worker, 3 as unknown as string)).toBe(true);
  });

  it("returns false when worker.services is empty or missing", () => {
    const worker = { id: "w1", name: "Avi", services: [], active: true };
    expect(canWorkerPerformService(worker, "גוונים")).toBe(false);
    expect(canWorkerPerformService(worker as { id: string; name: string; active: boolean }, "גוונים")).toBe(false);
  });
});

describe("resolveChainWorkers – main + follow-up, preferred worker can do main only", () => {
  const serviceA = { id: "id-a", name: "גוונים" };
  const serviceB = { id: "id-b", name: "פן" };
  const chain: ChainServiceInput[] = [
    {
      service: serviceA as { id: string; name: string },
      pricingItem: {
        id: "p1",
        serviceId: "id-a",
        durationMinMinutes: 30,
        durationMaxMinutes: 30,
        hasFollowUp: true,
        followUp: {
          name: "פן",
          serviceId: "id-b",
          durationMinutes: 20,
          waitMinutes: 10,
        },
      } as ChainServiceInput["pricingItem"],
    },
  ];

  const workers = [
    { id: "avi", name: "אבי", services: ["גוונים"], active: true },
    { id: "bob", name: "בוב", services: ["פן"], active: true },
  ];

  const dateStr = "2026-02-15";
  const startAt = new Date(2026, 1, 15, 10, 0, 0);
  const bookingsForDate: Array<{
    id: string;
    workerId?: string | null;
    date?: string;
    startAt?: Date;
    endAt?: Date;
    dateStr?: string;
    timeHHmm?: string;
    durationMin?: number;
    phase?: number;
    status?: string;
  }> = [];
  const workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null> = {
    avi: { startMin: 0, endMin: 24 * 60 },
    bob: { startMin: 0, endMin: 24 * 60 },
  };
  const businessWindow = { startMin: 0, endMin: 24 * 60 };

  it("assigns main (גוונים) to preferred worker Avi and follow-up (פן) to Bob when Avi cannot do פן", () => {
    const result = resolveChainWorkers({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      preferredWorkerId: "avi",
      workerWindowByWorkerId,
      businessWindow,
    });
    expect(result).not.toBeNull();
    const slots = result!;
    expect(slots.length).toBe(1);
    expect(slots[0]!.serviceName).toBe("גוונים");
    expect(slots[0]!.workerId).toBe("avi");
    expect(slots[0]!.followUp).toBeDefined();
    expect(slots[0]!.followUp!.serviceName).toBe("פן");
    expect(slots[0]!.followUp!.workerId).toBe("bob");
  });

  it("blocks when no worker can do follow-up service", () => {
    const workersOnlyA = [
      { id: "avi", name: "אבי", services: ["גוונים"], active: true },
    ];
    const result = resolveChainWorkers({
      chain,
      startAt,
      dateStr,
      workers: workersOnlyA,
      bookingsForDate,
      preferredWorkerId: "avi",
      workerWindowByWorkerId: { avi: { startMin: 0, endMin: 24 * 60 } },
      businessWindow,
    });
    expect(result).toBeNull();
  });
});

describe("resolveChainWorkers – ללא העדפה (no preference)", () => {
  const serviceA = { id: "id-a", name: "גוונים" };
  const chain: ChainServiceInput[] = [
    {
      service: serviceA as { id: string; name: string },
      pricingItem: {
        id: "p1",
        serviceId: "id-a",
        durationMinMinutes: 30,
        durationMaxMinutes: 30,
        hasFollowUp: true,
        followUp: {
          name: "פן",
          serviceId: "id-b",
          durationMinutes: 20,
          waitMinutes: 10,
        },
      } as ChainServiceInput["pricingItem"],
    },
  ];
  const workers = [
    { id: "avi", name: "אבי", services: ["גוונים"], active: true },
    { id: "bob", name: "בוב", services: ["פן"], active: true },
  ];
  const dateStr = "2026-02-15";
  const startAt = new Date(2026, 1, 15, 10, 0, 0);
  const bookingsForDate: Array<{ id: string; workerId?: string | null; dateStr?: string }> = [];
  const workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null> = {
    avi: { startMin: 0, endMin: 24 * 60 },
    bob: { startMin: 0, endMin: 24 * 60 },
  };
  const businessWindow = { startMin: 0, endMin: 24 * 60 };

  it("allows booking when at least one eligible worker exists per service (assigns each item to eligible worker)", () => {
    const result = resolveChainWorkers({
      chain,
      startAt,
      dateStr,
      workers,
      bookingsForDate,
      preferredWorkerId: null,
      workerWindowByWorkerId,
      businessWindow,
    });
    expect(result).not.toBeNull();
    const slots = result!;
    expect(slots.length).toBe(1);
    expect(slots[0]!.serviceName).toBe("גוונים");
    expect(slots[0]!.workerId).toBeTruthy();
    expect(["avi", "bob"]).toContain(slots[0]!.workerId);
    expect(slots[0]!.followUp).toBeDefined();
    expect(slots[0]!.followUp!.serviceName).toBe("פן");
    expect(slots[0]!.followUp!.workerId).toBeTruthy();
    expect(["avi", "bob"]).toContain(slots[0]!.followUp!.workerId);
  });

  it("if no one can do follow-up service, returns null (slot not offered / save blocked)", () => {
    const workersOnlyMain = [{ id: "avi", name: "אבי", services: ["גוונים"], active: true }];
    const result = resolveChainWorkers({
      chain,
      startAt,
      dateStr,
      workers: workersOnlyMain,
      bookingsForDate,
      preferredWorkerId: null,
      workerWindowByWorkerId: { avi: { startMin: 0, endMin: 24 * 60 } },
      businessWindow,
    });
    expect(result).toBeNull();
  });
});

describe("slotIsValidForNoPreference", () => {
  const serviceA = { id: "id-a", name: "גוונים" };
  const chain: ChainServiceInput[] = [
    {
      service: serviceA as { id: string; name: string },
      pricingItem: {
        id: "p1",
        serviceId: "id-a",
        durationMinMinutes: 30,
        durationMaxMinutes: 30,
        hasFollowUp: true,
        followUp: {
          name: "פן",
          serviceId: "id-b",
          durationMinutes: 20,
          waitMinutes: 10,
        },
      } as ChainServiceInput["pricingItem"],
    },
  ];
  const workers = [
    { id: "avi", name: "אבי", services: ["גוונים"], active: true },
    { id: "bob", name: "בוב", services: ["פן"], active: true },
  ];
  const dateStr = "2026-02-15";
  const startAt = new Date(2026, 1, 15, 10, 0, 0);
  const bookingsForDate: Array<{ id: string; workerId?: string | null; dateStr?: string }> = [];
  const workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null> = {
    avi: { startMin: 0, endMin: 24 * 60 },
    bob: { startMin: 0, endMin: 24 * 60 },
  };
  const businessWindow = { startMin: 0, endMin: 24 * 60 };

  it("returns valid when each chain item has at least one eligible+available worker (workers may differ)", () => {
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

  it("returns invalid when no worker can do follow-up (rejectReason no_eligible)", () => {
    const workersOnlyMain = [{ id: "avi", name: "אבי", services: ["גוונים"], active: true }];
    const result = slotIsValidForNoPreference({
      chain,
      startAt,
      dateStr,
      workers: workersOnlyMain,
      bookingsForDate,
      workerWindowByWorkerId: { avi: { startMin: 0, endMin: 24 * 60 } },
      businessWindow,
    });
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toBe("no_eligible");
    expect(result.rejectServiceName).toBe("פן");
  });
});

describe("repairInvalidAssignments", () => {
  it("reassigns follow-up to eligible worker when current assignee cannot do service", () => {
    const workers = [
      { id: "avi", name: "אבי", services: ["גוונים"], active: true },
      { id: "bob", name: "בוב", services: ["פן"], active: true },
    ];
    const repaired = repairInvalidAssignments(
      [
        {
          serviceOrder: 0,
          serviceName: "גוונים",
          serviceId: "id-a",
          serviceType: null,
          durationMin: 30,
          startAt: new Date(2026, 1, 15, 10, 0, 0),
          endAt: new Date(2026, 1, 15, 10, 30, 0),
          workerId: "avi",
          workerName: "אבי",
          followUp: {
            serviceName: "פן",
            serviceId: "id-b",
            durationMin: 20,
            waitMin: 10,
            startAt: new Date(2026, 1, 15, 10, 40, 0),
            endAt: new Date(2026, 1, 15, 11, 0, 0),
            workerId: "avi",
            workerName: "אבי",
          },
        },
      ],
      workers,
      {
        dateStr: "2026-02-15",
        bookingsForDate: [],
        workerWindowByWorkerId: { avi: { startMin: 0, endMin: 24 * 60 }, bob: { startMin: 0, endMin: 24 * 60 } },
        businessWindow: { startMin: 0, endMin: 24 * 60 },
      }
    );
    expect(repaired).not.toBeNull();
    expect(repaired![0].followUp!.workerId).toBe("bob");
  });

  it("returns null when no eligible available worker for follow-up", () => {
    const workersOnlyA = [{ id: "avi", name: "אבי", services: ["גוונים"], active: true }];
    const repaired = repairInvalidAssignments(
      [
        {
          serviceOrder: 0,
          serviceName: "גוונים",
          serviceId: "id-a",
          serviceType: null,
          durationMin: 30,
          startAt: new Date(2026, 1, 15, 10, 0, 0),
          endAt: new Date(2026, 1, 15, 10, 30, 0),
          workerId: "avi",
          workerName: "אבי",
          followUp: {
            serviceName: "פן",
            serviceId: "id-b",
            durationMin: 20,
            waitMin: 10,
            startAt: new Date(2026, 1, 15, 10, 40, 0),
            endAt: new Date(2026, 1, 15, 11, 0, 0),
            workerId: "avi",
            workerName: "אבי",
          },
        },
      ],
      workersOnlyA,
      {
        dateStr: "2026-02-15",
        bookingsForDate: [],
        workerWindowByWorkerId: { avi: { startMin: 0, endMin: 24 * 60 } },
        businessWindow: { startMin: 0, endMin: 24 * 60 },
      }
    );
    expect(repaired).toBeNull();
  });
});

describe("validateChainAssignments", () => {
  it("validates each (serviceId, workerId) pair independently", () => {
    const workers = [
      { id: "avi", name: "אבי", services: ["גוונים"], active: true },
      { id: "bob", name: "בוב", services: ["פן"], active: true },
    ];
    const valid = validateChainAssignments(
      [
        {
          serviceName: "גוונים",
          serviceId: "id-a",
          workerId: "avi",
          workerName: "אבי",
          followUp: {
            serviceName: "פן",
            serviceId: "id-b",
            workerId: "bob",
            workerName: "בוב",
          },
        },
      ],
      workers
    );
    expect(valid.valid).toBe(true);
  });

  it("fails when follow-up worker cannot do follow-up service", () => {
    const workers = [
      { id: "avi", name: "אבי", services: ["גוונים"], active: true },
      { id: "bob", name: "בוב", services: ["פן"], active: true },
    ];
    const invalid = validateChainAssignments(
      [
        {
          serviceName: "גוונים",
          serviceId: "id-a",
          workerId: "avi",
          workerName: "אבי",
          followUp: {
            serviceName: "פן",
            serviceId: "id-b",
            workerId: "avi",
            workerName: "אבי",
            durationMin: 20,
          },
        },
      ],
      workers
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((e) => e.includes("פן") || e.includes("follow-up"))).toBe(true);
  });
});
