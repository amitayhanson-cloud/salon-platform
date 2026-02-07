import { describe, it, expect } from "vitest";
import { normalizePhone } from "./normalize";

describe("normalizePhone", () => {
  it("054-668-9977 → 0546689977", () => {
    expect(normalizePhone("054-668-9977")).toBe("0546689977");
  });

  it("+972546689977 → 0546689977", () => {
    expect(normalizePhone("+972546689977")).toBe("0546689977");
  });

  it("972546689977 → 0546689977", () => {
    expect(normalizePhone("972546689977")).toBe("0546689977");
  });

  it("546689977 → 0546689977 (9 digits missing leading 0)", () => {
    expect(normalizePhone("546689977")).toBe("0546689977");
  });

  it("050 210 7858 → 0502107858", () => {
    expect(normalizePhone("050 210 7858")).toBe("0502107858");
  });

  it("preserves 0546689977 as-is", () => {
    expect(normalizePhone("0546689977")).toBe("0546689977");
  });

  it("+972 54 668 9977 → 0546689977", () => {
    expect(normalizePhone("+972 54 668 9977")).toBe("0546689977");
  });

  it("strip parentheses", () => {
    expect(normalizePhone("(054) 668-9977")).toBe("0546689977");
  });
});
