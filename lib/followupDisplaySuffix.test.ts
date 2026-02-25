import { describe, it, expect } from "vitest";
import { getFollowUpDisplaySuffix } from "./followupDisplaySuffix";
import type { PricingItem } from "@/types/pricingItem";

function pricingItem(overrides: Partial<PricingItem> & { followUp: { name: string; text?: string; serviceId?: string; durationMinutes: number; waitMinutes: number } }): PricingItem {
  return {
    id: "p1",
    serviceId: "s1",
    durationMinMinutes: 30,
    durationMaxMinutes: 30,
    createdAt: "",
    updatedAt: "",
    hasFollowUp: true,
    followUp: overrides.followUp,
    ...overrides,
  } as PricingItem;
}

describe("getFollowUpDisplaySuffix", () => {
  it("returns suffix when followUp name matches and text is set", () => {
    const items: PricingItem[] = [
      pricingItem({
        followUp: { name: "החלקה", text: "קרטין", durationMinutes: 30, waitMinutes: 0 },
      }),
    ];
    expect(getFollowUpDisplaySuffix("החלקה", null, items)).toBe("קרטין");
    expect(getFollowUpDisplaySuffix("החלקה", undefined, items)).toBe("קרטין");
  });

  it("returns null when followUp has no text", () => {
    const items: PricingItem[] = [
      pricingItem({
        followUp: { name: "החלקה", durationMinutes: 30, waitMinutes: 0 },
      }),
    ];
    expect(getFollowUpDisplaySuffix("החלקה", null, items)).toBeNull();
  });

  it("returns null when serviceName is empty", () => {
    const items: PricingItem[] = [
      pricingItem({
        followUp: { name: "החלקה", text: "קרטין", durationMinutes: 30, waitMinutes: 0 },
      }),
    ];
    expect(getFollowUpDisplaySuffix("", null, items)).toBeNull();
  });

  it("matches by serviceId when provided", () => {
    const items: PricingItem[] = [
      pricingItem({
        followUp: { name: "החלקה", text: "קרטין", serviceId: "svc-123", durationMinutes: 30, waitMinutes: 0 },
      }),
    ];
    expect(getFollowUpDisplaySuffix("החלקה", "svc-123", items)).toBe("קרטין");
  });

  it("returns first matching item when multiple have followUp", () => {
    const items: PricingItem[] = [
      pricingItem({
        followUp: { name: "תספורת", text: "קצר", durationMinutes: 20, waitMinutes: 0 },
      }),
      pricingItem({
        followUp: { name: "החלקה", text: "קרטין", durationMinutes: 30, waitMinutes: 0 },
      }),
    ];
    expect(getFollowUpDisplaySuffix("החלקה", null, items)).toBe("קרטין");
    expect(getFollowUpDisplaySuffix("תספורת", null, items)).toBe("קצר");
  });
});
