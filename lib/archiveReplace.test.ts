/**
 * Tests for archive replace: keep only newest archived per (tenant, client, serviceType).
 * - getServiceTypeKey: pure function, tested here.
 * - Integration behavior (first archive creates; same serviceType replaces; different serviceType both exist;
 *   different clients/tenants isolated) is enforced by the helper logic and should be validated in E2E or
 *   with a script that uses the real Admin SDK against a test project.
 */

import { describe, it, expect } from "vitest";
import { getServiceTypeKey, getDeterministicArchiveDocId } from "./archiveReplace";

describe("getServiceTypeKey", () => {
  it("uses serviceTypeId when present", () => {
    expect(getServiceTypeKey({ serviceTypeId: "st1", serviceType: "Hair Color" })).toBe("st1");
  });

  it("falls back to serviceType when serviceTypeId missing", () => {
    expect(getServiceTypeKey({ serviceType: "Roots" })).toBe("Roots");
  });

  it("returns unknown when both missing", () => {
    expect(getServiceTypeKey({})).toBe("unknown");
  });

  it("returns unknown when both empty string", () => {
    expect(getServiceTypeKey({ serviceTypeId: "", serviceType: "" })).toBe("unknown");
  });

  it("trims and uses first non-empty", () => {
    expect(getServiceTypeKey({ serviceTypeId: "  id1  ", serviceType: "Full" })).toBe("id1");
  });
});

describe("getDeterministicArchiveDocId", () => {
  it("returns clientId__serviceTypeId when both set", () => {
    const r = getDeterministicArchiveDocId("c1", "050123", "st1", "bid");
    expect(r.docId).toBe("c1__st1");
    expect(r.shouldDeleteOthers).toBe(true);
  });

  it("falls back to customerPhone when clientId missing", () => {
    const r = getDeterministicArchiveDocId(null, "050123", "st1", "bid");
    expect(r.docId).toBe("050123__st1");
    expect(r.shouldDeleteOthers).toBe(true);
  });

  it("returns unknown__unknown__bookingId when no serviceTypeId and does not delete others", () => {
    const r = getDeterministicArchiveDocId("c1", "050", null, "booking-xyz");
    expect(r.docId).toBe("c1__unknown__booking-xyz");
    expect(r.shouldDeleteOthers).toBe(false);
  });
});
