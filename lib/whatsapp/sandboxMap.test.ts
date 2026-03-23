import { describe, it, expect } from "vitest";
import { mapBodyForSandbox } from "./sandboxMap";

describe("mapBodyForSandbox", () => {
  it("preserves newlines in reminder body (no paragraph merge)", () => {
    const body = "שורה א.\n\nמגיע/ה?\nכן\nאו\nלא";
    const mapped = mapBodyForSandbox({ body, automation: "reminder_24h" });
    expect(mapped).toContain("\n\nמגיע");
    expect(mapped.startsWith("*Sandbox* תזכורת:\n")).toBe(true);
  });

  it("trims and collapses spaces within a line only", () => {
    const mapped = mapBodyForSandbox({
      body: "היי   שם\n\nשורה",
      automation: "booking_confirmation",
    });
    expect(mapped).toContain("היי שם");
    expect(mapped).toContain("\n\nשורה");
  });
});
