import { describe, it, expect } from "vitest";
import { RESERVED_SLUGS, validateSlug, normalizeSlug, isValidSlugFormat } from "./slug";

describe("lib/slug", () => {
  describe("RESERVED_SLUGS", () => {
    it("includes required reserved subdomains", () => {
      expect(RESERVED_SLUGS).toContain("www");
      expect(RESERVED_SLUGS).toContain("admin");
      expect(RESERVED_SLUGS).toContain("api");
      expect(RESERVED_SLUGS).toContain("login");
      expect(RESERVED_SLUGS).toContain("app");
      expect(RESERVED_SLUGS).toContain("mail");
      expect(RESERVED_SLUGS).toContain("support");
      expect(RESERVED_SLUGS).toContain("help");
      expect(RESERVED_SLUGS).toContain("static");
      expect(RESERVED_SLUGS).toContain("assets");
      expect(RESERVED_SLUGS).toContain("cdn");
      expect(RESERVED_SLUGS).toContain("dashboard");
      expect(RESERVED_SLUGS).toContain("docs");
      expect(RESERVED_SLUGS).toContain("billing");
      expect(RESERVED_SLUGS).toContain("settings");
      expect(RESERVED_SLUGS).toContain("auth");
      expect(RESERVED_SLUGS).toContain("oauth");
      expect(RESERVED_SLUGS).toContain("_next");
    });
  });

  describe("validateSlug", () => {
    it("returns ok and normalized for valid slug", () => {
      const r = validateSlug("amitay-123");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized).toBe("amitay-123");
      }
    });

    it("normalizes 'AbC' to 'abc' and returns ok if not reserved", () => {
      const r = validateSlug("AbC");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized).toBe("abc");
      }
    });

    it("rejects invalid chars (e.g. underscore)", () => {
      const r = validateSlug("a_b");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBeDefined();
    });

    it("rejects too short", () => {
      const r = validateSlug("ab");
      expect(r.ok).toBe(false);
    });

    it("rejects too long", () => {
      const r = validateSlug("a".repeat(31));
      expect(r.ok).toBe(false);
    });

    it("rejects leading hyphen", () => {
      const r = validateSlug("-abc");
      expect(r.ok).toBe(false);
    });

    it("rejects trailing hyphen", () => {
      const r = validateSlug("abc-");
      expect(r.ok).toBe(false);
    });

    it("rejects reserved slug 'www'", () => {
      const r = validateSlug("www");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBeDefined();
    });

    it("rejects reserved slug 'admin'", () => {
      const r = validateSlug("admin");
      expect(r.ok).toBe(false);
    });

    it("rejects reserved slug 'login'", () => {
      const r = validateSlug("login");
      expect(r.ok).toBe(false);
    });

    it("accepts consecutive hyphens by normalizing to single hyphen", () => {
      const r = validateSlug("a--b");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.normalized).toBe("a-b");
    });
  });

  describe("normalizeSlug", () => {
    it("lowercases and trims and collapses hyphens", () => {
      expect(normalizeSlug("  My-Salon  ")).toBe("my-salon");
      expect(normalizeSlug("a--b")).toBe("a-b");
    });
  });

  describe("isValidSlugFormat", () => {
    it("returns true for valid format without reserved check", () => {
      expect(isValidSlugFormat("abc")).toBe(true);
      expect(isValidSlugFormat("amitay-123")).toBe(true);
    });
    it("returns false for too short or invalid chars", () => {
      expect(isValidSlugFormat("ab")).toBe(false);
      expect(isValidSlugFormat("a_b")).toBe(false);
    });
  });
});
