/**
 * Unit tests for cascade cancel: resolver (explicit group + heuristic) and cancelBookingsCascade.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));
vi.mock("@/lib/whatsapp/relatedBookings", () => ({
  getRelatedBookingIds: vi.fn(),
  MAX_RELATED_BOOKINGS: 20,
}));

import { getAdminDb } from "@/lib/firebaseAdmin";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";
import {
  resolveRelatedBookingIdsToCascadeCancel,
  cancelBookingsCascade,
  CASCADE_CAP,
} from "./booking-cascade";

describe("resolveRelatedBookingIdsToCascadeCancel", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
    vi.mocked(getRelatedBookingIds).mockReset();
  });

  it("returns explicit group when getRelatedBookingIds returns multiple ids", async () => {
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["root1", "follow1", "follow2"],
      groupKey: "visit-abc",
      rootId: "root1",
    });
    const db = { collection: vi.fn() };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const ids = await resolveRelatedBookingIdsToCascadeCancel("site1", "root1");

    expect(getRelatedBookingIds).toHaveBeenCalledWith("site1", "root1");
    expect(ids).toEqual(["root1", "follow1", "follow2"]);
  });

  it("uses heuristic when no explicit group (single id): same customer + createdAt window", async () => {
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["b1"],
      groupKey: "b1",
      rootId: "b1",
    });
    const ts = { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) };
    const docGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        customerPhoneE164: "+972501234567",
        createdAt: ts,
        dateISO: "2025-02-15",
      }),
    });
    const windowDocs = [
      { id: "b1", data: () => ({ customerPhoneE164: "+972501234567", dateISO: "2025-02-15" }) },
      { id: "b2", data: () => ({ customerPhoneE164: "+972501234567", dateISO: "2025-02-15" }) },
    ];
    const queryGet = vi.fn().mockResolvedValue({ docs: windowDocs });
    const col = {
      doc: vi.fn().mockReturnValue({ get: docGet }),
      where: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: queryGet }) }),
      }),
    };
    const db = {
      collection: vi.fn().mockImplementation((name: string) =>
        name === "sites" ? { doc: () => ({ collection: () => col }) } : {}
      ),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const ids = await resolveRelatedBookingIdsToCascadeCancel("site1", "b1");

    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    expect(ids.length).toBeLessThanOrEqual(CASCADE_CAP);
  });

  it("returns only bookingId when doc has no customer or createdAt (heuristic path)", async () => {
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["orphan"],
      groupKey: "orphan",
      rootId: "orphan",
    });
    const docGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({}),
    });
    const col = { doc: vi.fn().mockReturnValue({ get: docGet }) };
    const db = {
      collection: vi.fn().mockImplementation((name: string) =>
        name === "sites" ? { doc: () => ({ collection: () => col }) } : {}
      ),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const ids = await resolveRelatedBookingIdsToCascadeCancel("site1", "orphan");

    expect(ids).toEqual(["orphan"]);
  });

  it("returns only bookingId when doc does not exist (heuristic path)", async () => {
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["missing"],
      groupKey: "missing",
      rootId: "missing",
    });
    const docGet = vi.fn().mockResolvedValue({ exists: false });
    const col = { doc: vi.fn().mockReturnValue({ get: docGet }) };
    const db = {
      collection: vi.fn().mockImplementation((name: string) =>
        name === "sites" ? { doc: () => ({ collection: () => col }) } : {}
      ),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const ids = await resolveRelatedBookingIdsToCascadeCancel("site1", "missing");

    expect(ids).toEqual(["missing"]);
  });
});

describe("cancelBookingsCascade", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
  });

  it("updates all non-archived docs in one batch and returns successCount", async () => {
    const refs: { get: ReturnType<typeof vi.fn> }[] = [];
    const doc = (id: string) => ({
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({}),
      }),
    });
    refs.push(doc("a"), doc("b"));
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    const batch = { update: batchUpdate, commit: batchCommit };
    const bookingsCol = {
      doc: vi.fn().mockImplementation((id: string) => {
        const d = doc(id);
        return { ...d, id };
      }),
    };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) =>
        name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {}
      ),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await cancelBookingsCascade("site1", ["a", "b"], "manual");

    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(0);
    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "cancelled",
        isArchived: true,
        archivedReason: "manual",
      })
    );
  });

  it("skips already-archived docs (idempotent)", async () => {
    const bookingsCol = {
      doc: vi.fn().mockImplementation((id: string) => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ isArchived: id === "archived" }),
        }),
      })),
    };
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    const batch = { update: batchUpdate, commit: batchCommit };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) =>
        name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {}
      ),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await cancelBookingsCascade("site1", ["archived", "active"], "manual");

    expect(result.successCount).toBe(1);
    expect(batch.update).toHaveBeenCalledTimes(1);
  });

  it("uses WhatsApp payload when reason is customer_cancelled_via_whatsapp", async () => {
    const bookingsCol = {
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      }),
    };
    const batchUpdate = vi.fn();
    const batch = { update: batchUpdate, commit: vi.fn().mockResolvedValue(undefined) };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) =>
        name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {}
      ),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    await cancelBookingsCascade("site1", ["b1"], "customer_cancelled_via_whatsapp");

    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        whatsappStatus: "cancelled",
        status: "cancelled",
        archivedReason: "customer_cancelled_via_whatsapp",
      })
    );
  });

  it("returns { 0, 0 } for empty bookingIds", async () => {
    const result = await cancelBookingsCascade("site1", [], "manual");
    expect(result).toEqual({ successCount: 0, failCount: 0 });
  });
});
