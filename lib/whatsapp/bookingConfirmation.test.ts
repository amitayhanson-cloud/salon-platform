/**
 * Unit tests for WhatsApp confirmation flow: YES/NO applied to all group members.
 * Mocks Firestore and relatedBookings; no booking creation or scheduling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));
vi.mock("./relatedBookings", () => ({
  getRelatedBookingIds: vi.fn(),
}));

import { getAdminDb } from "@/lib/firebaseAdmin";
import { getRelatedBookingIds } from "./relatedBookings";
import {
  markBookingConfirmed,
  markBookingCancelledByWhatsApp,
  applyCancelledByWhatsAppToBooking,
} from "./bookingConfirmation";

describe("markBookingConfirmed (YES)", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
    vi.mocked(getRelatedBookingIds).mockReset();
  });

  it("updates status for all members in group", async () => {
    const batchUpdate = vi.fn();
    const batch = { update: batchUpdate, commit: vi.fn().mockResolvedValue(undefined) };
    const bookingsCol = {
      doc: vi.fn().mockImplementation((id: string) => ({ id, path: `sites/site1/bookings/${id}` })),
    };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) => (name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {})),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["root1", "follow1", "follow2"],
      groupKey: "visit-abc",
      rootId: "root1",
    });

    await markBookingConfirmed("site1", "root1");

    expect(getRelatedBookingIds).toHaveBeenCalledWith("site1", "root1");
    expect(batch.update).toHaveBeenCalledTimes(3);
    expect(bookingsCol.doc).toHaveBeenCalledWith("root1");
    expect(bookingsCol.doc).toHaveBeenCalledWith("follow1");
    expect(bookingsCol.doc).toHaveBeenCalledWith("follow2");
    expect(batch.update).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        whatsappStatus: "confirmed",
        confirmationReceivedAt: expect.anything(),
        updatedAt: expect.anything(),
      })
    );
    expect(batch.commit).toHaveBeenCalled();
  });

  it("updates single booking when no group", async () => {
    const batchUpdate = vi.fn();
    const batch = { update: batchUpdate, commit: vi.fn().mockResolvedValue(undefined) };
    const bookingsCol = { doc: vi.fn().mockReturnValue({}) };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) => (name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {})),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["only1"],
      groupKey: "only1",
      rootId: "only1",
    });

    await markBookingConfirmed("site1", "only1");

    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalled();
  });
});

describe("markBookingCancelledByWhatsApp / cancelBookingGroupByWhatsApp (NO)", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
    vi.mocked(getRelatedBookingIds).mockReset();
  });

  it("reply NO cancels all bookings in group via single batch, not just root", async () => {
    vi.mocked(getRelatedBookingIds).mockResolvedValue({
      bookingIds: ["root1", "follow1", "follow2"],
      groupKey: "visit-abc",
      rootId: "root1",
    });
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    const batch = { update: batchUpdate, commit: batchCommit };
    const bookingsCol = {
      doc: vi.fn().mockImplementation((id: string) => ({ id, path: `sites/site1/bookings/${id}` })),
    };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) => (name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {})),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    await markBookingCancelledByWhatsApp("site1", "root1");

    expect(getRelatedBookingIds).toHaveBeenCalledWith("site1", "root1");
    expect(bookingsCol.doc).toHaveBeenCalledWith("root1");
    expect(bookingsCol.doc).toHaveBeenCalledWith("follow1");
    expect(bookingsCol.doc).toHaveBeenCalledWith("follow2");
    expect(batch.update).toHaveBeenCalledTimes(3);
    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        whatsappStatus: "cancelled",
        status: "cancelled",
        isArchived: true,
        archivedReason: "customer_cancelled_via_whatsapp",
      })
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("NO resolves group first then one batch commit (updates before writes, root not deleted before follow-ups)", async () => {
    const callOrder: string[] = [];
    vi.mocked(getRelatedBookingIds).mockImplementation(async () => {
      callOrder.push("getRelatedBookingIds");
      return {
        bookingIds: ["root1", "follow1"],
        groupKey: "visit-xyz",
        rootId: "root1",
      };
    });
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockImplementation(async () => {
      callOrder.push("batch.commit");
      return undefined;
    });
    const batch = { update: batchUpdate, commit: batchCommit };
    const bookingsCol = { doc: vi.fn().mockReturnValue({}) };
    const db = {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) => (name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {})),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    await markBookingCancelledByWhatsApp("site1", "root1");

    expect(callOrder).toEqual(["getRelatedBookingIds", "batch.commit"]);
    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("applyCancelledByWhatsAppToBooking", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
  });

  it("updates one booking doc with cancel/archive payload", async () => {
    const refUpdate = vi.fn().mockResolvedValue(undefined);
    const bookingsCol = {
      doc: vi.fn().mockReturnValue({ update: refUpdate }),
    };
    const db = {
      collection: vi.fn().mockImplementation((name: string) => (name === "sites" ? { doc: () => ({ collection: () => bookingsCol }) } : {})),
    };
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    await applyCancelledByWhatsAppToBooking("site1", "booking1");

    expect(bookingsCol.doc).toHaveBeenCalledWith("booking1");
    expect(refUpdate).toHaveBeenCalledTimes(1);
    expect(refUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappStatus: "cancelled",
        status: "cancelled",
        cancelledAt: expect.anything(),
        isArchived: true,
        archivedAt: expect.anything(),
        archivedReason: "customer_cancelled_via_whatsapp",
        updatedAt: expect.anything(),
      })
    );
  });
});
