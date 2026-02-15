/**
 * Unit tests for root booking resolution and display status.
 * Does NOT touch booking creation or scheduling.
 */

import { describe, it, expect } from "vitest";
import {
  resolveRootBookingId,
  getDisplayStatus,
  type BookingLikeForRoot,
} from "./bookingRootStatus";

function booking(
  id: string,
  opts: { parentBookingId?: string | null; whatsappStatus?: string } = {}
): BookingLikeForRoot {
  return { id, ...opts };
}

function toMap(list: BookingLikeForRoot[]): Map<string, BookingLikeForRoot> {
  const m = new Map<string, BookingLikeForRoot>();
  for (const b of list) m.set(b.id, b);
  return m;
}

describe("resolveRootBookingId", () => {
  it("returns own id when booking has no parentBookingId", () => {
    const b = booking("a");
    const map = toMap([b]);
    expect(resolveRootBookingId(b, map)).toBe("a");
  });

  it("returns own id when parent is not in the list (backwards compatible)", () => {
    const b = booking("follow", { parentBookingId: "root" });
    const map = toMap([b]);
    expect(resolveRootBookingId(b, map)).toBe("follow");
  });

  it("returns parent id when parent is in the list (one level)", () => {
    const root = booking("root");
    const follow = booking("follow", { parentBookingId: "root" });
    const map = toMap([root, follow]);
    expect(resolveRootBookingId(follow, map)).toBe("root");
  });

  it("walks up to root (two levels)", () => {
    const root = booking("root");
    const mid = booking("mid", { parentBookingId: "root" });
    const follow = booking("follow", { parentBookingId: "mid" });
    const map = toMap([root, mid, follow]);
    expect(resolveRootBookingId(follow, map)).toBe("root");
  });

  it("stops at max depth to avoid infinite loop", () => {
    const a = booking("a", { parentBookingId: "b" });
    const b = booking("b", { parentBookingId: "a" });
    const map = toMap([a, b]);
    const id = resolveRootBookingId(a, map);
    expect(id === "a" || id === "b").toBe(true);
  });

  it("root booking returns own id", () => {
    const root = booking("root");
    const follow = booking("follow", { parentBookingId: "root" });
    const map = toMap([root, follow]);
    expect(resolveRootBookingId(root, map)).toBe("root");
  });
});

describe("getDisplayStatus", () => {
  it("returns booking's own status when no parent in list", () => {
    const b = booking("b", { whatsappStatus: "confirmed" });
    const { label } = getDisplayStatus(b, [b]);
    expect(label).toContain("מאושר");
  });

  it("returns root's status for follow-up when root is in list", () => {
    const root = booking("root", { whatsappStatus: "awaiting_confirmation" });
    const follow = booking("follow", {
      parentBookingId: "root",
      whatsappStatus: "booked",
    });
    const all = [root, follow];
    const followStatus = getDisplayStatus(follow, all);
    expect(followStatus.label).toContain("ממתין");
    const rootStatus = getDisplayStatus(root, all);
    expect(rootStatus.label).toContain("ממתין");
  });

  it("follow-up shows cancelled when root is cancelled", () => {
    const root = booking("root", { whatsappStatus: "cancelled" });
    const follow = booking("follow", {
      parentBookingId: "root",
      whatsappStatus: "booked",
    });
    const followStatus = getDisplayStatus(follow, [root, follow]);
    expect(followStatus.label).toContain("בוטל");
    expect(followStatus.color).toBe("red");
  });
});
