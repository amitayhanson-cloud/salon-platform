import { describe, it, expect } from "vitest";
import {
  buildWazeUrlFromAddress,
  confirmationWazeBlockFromUrl,
  reminderWazeBlockFromUrl,
} from "./businessWaze";

describe("businessWaze", () => {
  it("buildWazeUrlFromAddress returns empty for missing/blank", () => {
    expect(buildWazeUrlFromAddress(undefined)).toBe("");
    expect(buildWazeUrlFromAddress("  ")).toBe("");
  });

  it("buildWazeUrlFromAddress encodes address", () => {
    expect(buildWazeUrlFromAddress("רחוב 1, תל אביב")).toContain("waze.com");
    expect(buildWazeUrlFromAddress("רחוב 1, תל אביב")).toContain(encodeURIComponent("רחוב 1, תל אביב"));
  });

  it("confirmationWazeBlockFromUrl is empty without URL", () => {
    expect(confirmationWazeBlockFromUrl("")).toBe("");
  });

  it("reminderWazeBlockFromUrl includes מחכים לראותך", () => {
    const u = "https://waze.com/ul?q=test&navigate=yes";
    expect(reminderWazeBlockFromUrl(u)).toContain("מחכים לראותך");
    expect(reminderWazeBlockFromUrl(u)).toContain(u);
  });
});
