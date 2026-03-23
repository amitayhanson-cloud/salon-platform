import { describe, expect, it } from "vitest";
import { firestoreClientSettingsDataNeedsBackfill } from "./clientStatusSettingsBackfill";

describe("firestoreClientSettingsDataNeedsBackfill", () => {
  it("needs backfill when doc missing", () => {
    expect(firestoreClientSettingsDataNeedsBackfill(undefined)).toBe(true);
    expect(firestoreClientSettingsDataNeedsBackfill(null)).toBe(true);
  });

  it("needs backfill when statusRules is empty object (JS truthy bug case)", () => {
    expect(firestoreClientSettingsDataNeedsBackfill({ statusRules: {}, manualTags: [] })).toBe(true);
  });

  it("ok when full rules and manualTags array", () => {
    expect(
      firestoreClientSettingsDataNeedsBackfill({
        statusRules: {
          newMaxTotalBookings: 2,
          activeMinBookings: 2,
          activeWindowDays: 30,
          sleepingNoBookingsFor: 60,
          sleepingWindowUnit: "days",
        },
        manualTags: [{ id: "vip", label: "VIP", sortOrder: 0 }],
      })
    ).toBe(false);
  });
});
