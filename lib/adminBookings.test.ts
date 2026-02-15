/**
 * Unit tests for admin single-booking updates.
 * Ensures editing one booking (phase 1) does NOT update related bookings (e.g. phase 2).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateDoc = vi.fn();
const mockWriteBatch = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
    writeBatch: vi.fn(() => ({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
  };
});

// Mock so adminBookings sees a truthy db (same module as adminBookings' "./firebaseClient")
vi.mock("./firebaseClient", () => ({
  db: { __mockDb: true },
}));

const phase1Ref = { id: "phase1-id", type: "phase1" };
const phase2Ref = { id: "phase2-id", type: "phase2" };
vi.mock("./firestorePaths", () => ({
  bookingDoc: vi.fn((_siteId: string, bookingId: string) =>
    bookingId === "phase1-id" ? phase1Ref : phase2Ref
  ),
  bookingsCollection: vi.fn(),
}));

vi.mock("./firestoreClients", () => ({
  getOrCreateClient: vi.fn().mockResolvedValue("client-1"),
}));

vi.mock("./bookingConflicts", () => ({
  checkWorkerConflicts: vi.fn().mockResolvedValue({ hasConflict: false }),
}));

import { bookingDoc } from "./firestorePaths";
import { updatePhase1Only } from "./adminBookings";

describe("updatePhase1Only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("updates only the phase 1 document; does not touch phase 2 or use batch", async () => {
    const payload = {
      customerName: "Test User",
      customerPhone: "+972501234567",
      date: "2025-02-15",
      time: "10:00",
      phase1: {
        serviceName: "Haircut",
        serviceTypeId: null,
        serviceType: null,
        workerId: "w1",
        workerName: "Worker One",
        durationMin: 30,
        serviceColor: null,
        serviceId: null,
      },
      phase2: {
        enabled: true,
        serviceName: "Color",
        waitMinutes: 15,
        durationMin: 45,
        workerIdOverride: null,
        workerNameOverride: null,
      },
      note: null,
      notes: null,
      status: "confirmed" as const,
      price: null,
    };

    await updatePhase1Only("site1", "phase1-id", payload);

    // Single updateDoc call only (no batch, no phase 2 update)
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      phase1Ref,
      expect.objectContaining({
        customerName: "Test User",
        workerId: "w1",
        durationMin: 30,
        dateISO: "2025-02-15",
        timeHHmm: "10:00",
        updateMeta: expect.objectContaining({ source: "admin", scope: "single" }),
      })
    );

    // writeBatch must not be used (so no batch.update for phase 2)
    expect(mockWriteBatch).not.toHaveBeenCalled();
    expect(mockBatchUpdate).not.toHaveBeenCalled();

    // bookingDoc must only have been called for phase1Id
    expect(bookingDoc).toHaveBeenCalledWith("site1", "phase1-id");
    expect(bookingDoc).not.toHaveBeenCalledWith("site1", "phase2-id");
  });
});
