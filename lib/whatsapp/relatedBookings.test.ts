/**
 * Tests for tag propagation lookup only.
 * Does NOT touch booking creation or scheduling. Mocks Firestore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));

import { getAdminDb } from "@/lib/firebaseAdmin";
import { getRelatedBookingIds, resolveBookingGroup, MAX_RELATED_BOOKINGS } from "./relatedBookings";

function mockDoc(id: string, data: Record<string, unknown>) {
  return { id, exists: true, data: () => data };
}

function mockSnapshot(docs: ReturnType<typeof mockDoc>[]) {
  return { docs, empty: docs.length === 0 };
}

function createMockDb(opts: {
  docExists: boolean;
  docData: Record<string, unknown>;
  visitGroupDocs?: ReturnType<typeof mockDoc>[];
  bookingGroupDocs?: ReturnType<typeof mockDoc>[];
  parentBookingIdDocs?: ReturnType<typeof mockDoc>[];
}) {
  const {
    docExists,
    docData,
    visitGroupDocs = [],
    bookingGroupDocs = [],
    parentBookingIdDocs = [],
  } = opts;

  const limitGet = vi.fn();
  const whereLimit = vi.fn().mockReturnValue({ get: limitGet });
  const bookingsCol = {
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue(
        docExists ? { exists: true, data: () => docData } : { exists: false }
      ),
    }),
    where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: limitGet }) }),
  };
  const siteDoc = { collection: vi.fn().mockReturnValue(bookingsCol) };
  const sitesCol = { doc: vi.fn().mockReturnValue(siteDoc) };
  const db = {
    collection: vi.fn().mockImplementation((name: string) => (name === "sites" ? sitesCol : {})),
  };

  let getCallCount = 0;
  limitGet.mockImplementation(() => {
    getCallCount++;
    if (getCallCount === 1 && (docData.visitGroupId || docData.bookingGroupId)) {
      return Promise.resolve(mockSnapshot(visitGroupDocs));
    }
    if (getCallCount === 2 && (docData.visitGroupId || docData.bookingGroupId)) {
      return Promise.resolve(mockSnapshot(bookingGroupDocs));
    }
    if (docData.parentBookingId && !docData.visitGroupId && !docData.bookingGroupId) {
      return Promise.resolve(mockSnapshot(parentBookingIdDocs));
    }
    return Promise.resolve(mockSnapshot([]));
  });

  return { db, limitGet };
}

describe("getRelatedBookingIds", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
  });

  it("returns only bookingId when doc does not exist (backwards compatibility)", async () => {
    const { db } = createMockDb({ docExists: false, docData: {} });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await getRelatedBookingIds("site1", "booking1");

    expect(result.bookingIds).toEqual(["booking1"]);
    expect(result.groupKey).toBeNull();
    expect(result.rootId).toBe("booking1");
  });

  it("returns only bookingId when doc has no visitGroupId or parentBookingId (backwards compatibility)", async () => {
    const { db, limitGet } = createMockDb({ docExists: true, docData: {} });
    limitGet.mockResolvedValue(mockSnapshot([]));
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await getRelatedBookingIds("site1", "booking1");

    expect(result.bookingIds).toEqual(["booking1"]);
    expect(result.groupKey).toBe("booking1");
    expect(result.rootId).toBe("booking1");
  });

  it("returns all booking IDs with same visitGroupId", async () => {
    const groupId = "visit-abc";
    const docs = [
      mockDoc("root1", { visitGroupId: groupId, bookingGroupId: groupId }),
      mockDoc("follow1", { visitGroupId: groupId, parentBookingId: "root1" }),
      mockDoc("follow2", { visitGroupId: groupId, parentBookingId: "root1" }),
    ];
    const { db, limitGet } = createMockDb({
      docExists: true,
      docData: { visitGroupId: groupId, bookingGroupId: groupId },
      visitGroupDocs: docs,
      bookingGroupDocs: docs,
    });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await getRelatedBookingIds("site1", "root1");

    expect(result.bookingIds).toContain("root1");
    expect(result.bookingIds).toContain("follow1");
    expect(result.bookingIds).toContain("follow2");
    expect(result.bookingIds.length).toBe(3);
    expect(result.groupKey).toBe(groupId);
    expect(result.rootId).toBe("root1");
  });

  it("returns root + follow-ups when booking has parentBookingId only", async () => {
    const follow2 = mockDoc("follow2", { parentBookingId: "root1" });
    const { db, limitGet } = createMockDb({
      docExists: true,
      docData: { parentBookingId: "root1" },
      parentBookingIdDocs: [follow2],
    });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await getRelatedBookingIds("site1", "follow1");

    expect(result.bookingIds).toContain("root1");
    expect(result.bookingIds).toContain("follow1");
    expect(result.bookingIds).toContain("follow2");
    expect(result.groupKey).toBe("root1");
    expect(result.rootId).toBe("root1");
  });

  it("caps related bookings at MAX_RELATED_BOOKINGS", async () => {
    const groupId = "big-group";
    const manyDocs = Array.from({ length: MAX_RELATED_BOOKINGS + 5 }, (_, i) =>
      mockDoc(`b${i}`, { visitGroupId: groupId })
    );
    const { db } = createMockDb({
      docExists: true,
      docData: { visitGroupId: groupId, bookingGroupId: groupId },
      visitGroupDocs: manyDocs,
      bookingGroupDocs: manyDocs,
    });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await getRelatedBookingIds("site1", "b0");

    expect(result.bookingIds.length).toBeLessThanOrEqual(MAX_RELATED_BOOKINGS);
    expect(result.groupKey).toBe(groupId);
    expect(result.rootId).toBeDefined();
    expect(result.bookingIds).toContain(result.rootId);
  });
});

describe("resolveBookingGroup", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
  });

  it("returns rootId and memberIds matching getRelatedBookingIds", async () => {
    const groupId = "visit-abc";
    const docs = [
      mockDoc("root1", { visitGroupId: groupId, bookingGroupId: groupId }),
      mockDoc("follow1", { visitGroupId: groupId, parentBookingId: "root1" }),
      mockDoc("follow2", { visitGroupId: groupId, parentBookingId: "root1" }),
    ];
    const { db, limitGet } = createMockDb({
      docExists: true,
      docData: { visitGroupId: groupId, bookingGroupId: groupId },
      visitGroupDocs: docs,
      bookingGroupDocs: docs,
    });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await resolveBookingGroup("site1", "root1");

    expect(result.rootId).toBe("root1");
    expect(result.memberIds).toEqual(expect.arrayContaining(["root1", "follow1", "follow2"]));
    expect(result.memberIds.length).toBe(3);
  });

  it("returns single-member group when doc does not exist", async () => {
    const { db } = createMockDb({ docExists: false, docData: {} });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await resolveBookingGroup("site1", "booking1");

    expect(result.rootId).toBe("booking1");
    expect(result.memberIds).toEqual(["booking1"]);
  });

  it("expiry/no-reply: returns all member ids so timeout handler can archive whole group (root + follow-ups)", async () => {
    const groupId = "visit-xyz";
    const docs = [
      mockDoc("root1", { visitGroupId: groupId, bookingGroupId: groupId }),
      mockDoc("follow1", { visitGroupId: groupId, parentBookingId: "root1" }),
      mockDoc("follow2", { visitGroupId: groupId, parentBookingId: "root1" }),
    ];
    const { db } = createMockDb({
      docExists: true,
      docData: { visitGroupId: groupId, bookingGroupId: groupId },
      visitGroupDocs: docs,
      bookingGroupDocs: docs,
    });
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const result = await resolveBookingGroup("site1", "root1");

    expect(result.memberIds).toHaveLength(3);
    expect(result.memberIds).toContain("root1");
    expect(result.memberIds).toContain("follow1");
    expect(result.memberIds).toContain("follow2");
    // Timeout/expiry handler should cancel/archive all 3, not just root
  });
});
