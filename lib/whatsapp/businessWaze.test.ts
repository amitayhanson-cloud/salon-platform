import { describe, it, expect } from "vitest";
import { buildWazeUrlFromAddress } from "./businessWaze";

describe("businessWaze", () => {
  it("buildWazeUrlFromAddress returns empty for missing/blank", () => {
    expect(buildWazeUrlFromAddress(undefined)).toBe("");
    expect(buildWazeUrlFromAddress("  ")).toBe("");
  });

  it("buildWazeUrlFromAddress encodes address", () => {
    expect(buildWazeUrlFromAddress("רחוב 1, תל אביב")).toContain("waze.com");
    expect(buildWazeUrlFromAddress("רחוב 1, תל אביב")).toContain(encodeURIComponent("רחוב 1, תל אביב"));
  });
});
