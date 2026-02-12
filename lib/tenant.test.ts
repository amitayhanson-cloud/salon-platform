import { describe, it, expect } from "vitest";
import {
  RESERVED_SLUGS,
  isReservedSlug,
  isValidTenantSlug,
  validateTenantSlug,
  normalizeTenantSlug,
  getSitePublicUrl,
  getSiteUrl,
} from "./tenant";

describe("tenant slug validation", () => {
  describe("isValidTenantSlug", () => {
    it("accepts 3–30 char lowercase alphanumeric and hyphen", () => {
      expect(isValidTenantSlug("abc")).toBe(true);
      expect(isValidTenantSlug("my-salon")).toBe(true);
      expect(isValidTenantSlug("salon123")).toBe(true);
      expect(isValidTenantSlug("a1b2c3")).toBe(true);
    });

    it("rejects too short or too long", () => {
      expect(isValidTenantSlug("ab")).toBe(false);
      expect(isValidTenantSlug("a")).toBe(false);
      expect(isValidTenantSlug("")).toBe(false);
      expect(isValidTenantSlug("a".repeat(31))).toBe(false);
      expect(isValidTenantSlug("a".repeat(30))).toBe(true);
    });

    it("rejects leading or trailing hyphen", () => {
      expect(isValidTenantSlug("-abc")).toBe(false);
      expect(isValidTenantSlug("abc-")).toBe(false);
      expect(isValidTenantSlug("-abc-")).toBe(false);
    });

    it("rejects invalid chars (underscore, space); normalizes to lowercase so 'Abc' is valid as 'abc'", () => {
      expect(isValidTenantSlug("Abc")).toBe(true); // trimmed and lowercased to "abc"
      expect(isValidTenantSlug("my_salon")).toBe(false);
      expect(isValidTenantSlug("my salon")).toBe(false);
    });
  });

  describe("RESERVED_SLUGS and isReservedSlug", () => {
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
    });

    it("isReservedSlug returns true for reserved slugs", () => {
      expect(isReservedSlug("www")).toBe(true);
      expect(isReservedSlug("admin")).toBe(true);
      expect(isReservedSlug("API")).toBe(true);
      expect(isReservedSlug("  login  ")).toBe(true);
    });

    it("isReservedSlug returns false for non-reserved", () => {
      expect(isReservedSlug("alice")).toBe(false);
      expect(isReservedSlug("my-salon")).toBe(false);
    });
  });

  describe("validateTenantSlug", () => {
    it("returns ok for valid non-reserved slug", () => {
      expect(validateTenantSlug("alice")).toEqual({ ok: true });
      expect(validateTenantSlug("my-salon-123")).toEqual({ ok: true });
    });

    it("returns error for invalid format", () => {
      expect(validateTenantSlug("ab").ok).toBe(false);
      expect(validateTenantSlug("").ok).toBe(false);
      expect(validateTenantSlug("-x").ok).toBe(false);
    });

    it("returns error for reserved slug", () => {
      const r = validateTenantSlug("admin");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toContain("reserved");
    });
  });

  describe("normalizeTenantSlug", () => {
    it("lowercases and trims", () => {
      expect(normalizeTenantSlug("  Alice  ")).toBe("alice");
    });
  });

  describe("getSitePublicUrl", () => {
    it("builds https subdomain URL with path", () => {
      expect(getSitePublicUrl("alice")).toMatch(/^https:\/\/alice\./);
      expect(getSitePublicUrl("alice", "/book")).toMatch(/\/book$/);
    });
  });

  describe("getSiteUrl", () => {
    it("returns public URL when slug is set", () => {
      expect(getSiteUrl("alice", "site-123", "")).toMatch(/^https:\/\/alice\./);
      expect(getSiteUrl("alice", "site-123", "/admin")).toMatch(/\/admin$/);
    });

    it("returns internal /site/<siteId> when slug is empty", () => {
      expect(getSiteUrl(null, "site-123", "")).toBe("/site/site-123");
      expect(getSiteUrl(undefined, "site-123", "/book")).toBe("/site/site-123/book");
      expect(getSiteUrl("", "site-123", "")).toBe("/site/site-123");
    });
  });
});
