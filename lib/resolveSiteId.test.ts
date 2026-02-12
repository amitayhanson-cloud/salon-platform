import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("./tenant-data", () => ({
  getTenantSiteId: vi.fn(),
}));

import { getTenantSiteId } from "./tenant-data";
import { resolveSiteIdFromRequest } from "./resolveSiteId";

function mockRequest(overrides: {
  host?: string;
  pathname?: string;
  searchParams?: Record<string, string>;
}): NextRequest {
  const host = overrides.host ?? "caleno.co";
  const path = overrides.pathname ?? "/api/foo";
  const query = overrides.searchParams
    ? "?" + new URLSearchParams(overrides.searchParams).toString()
    : "";
  const url = new URL(`https://${host}${path}${query}`);
  return {
    headers: { get: (k: string) => (k === "host" ? host : null) },
    nextUrl: url,
  } as unknown as NextRequest;
}

describe("resolveSiteIdFromRequest", () => {
  beforeEach(() => {
    vi.mocked(getTenantSiteId).mockReset();
  });

  it("resolves from tenant subdomain when host is <slug>.caleno.co", async () => {
    vi.mocked(getTenantSiteId).mockResolvedValue("site-123");
    const req = mockRequest({ host: "mysalon.caleno.co" });
    const result = await resolveSiteIdFromRequest(req);
    expect(result).toEqual({
      siteId: "site-123",
      tenantSlug: "mysalon",
      source: "host",
    });
    expect(getTenantSiteId).toHaveBeenCalledWith("mysalon");
  });

  it("resolves from path /site/<siteId> via query siteId when on root", async () => {
    const req = mockRequest({
      host: "caleno.co",
      searchParams: { siteId: "site-456" },
    });
    const result = await resolveSiteIdFromRequest(req);
    expect(result).toEqual({
      siteId: "site-456",
      tenantSlug: null,
      source: "query_siteId",
    });
    expect(getTenantSiteId).not.toHaveBeenCalled();
  });

  it("resolves from localhost ?tenant=<slug>", async () => {
    vi.mocked(getTenantSiteId).mockResolvedValue("site-789");
    const req = mockRequest({
      host: "localhost:3000",
      searchParams: { tenant: "alice" },
    });
    const result = await resolveSiteIdFromRequest(req);
    expect(result).toEqual({
      siteId: "site-789",
      tenantSlug: "alice",
      source: "query_tenant",
    });
    expect(getTenantSiteId).toHaveBeenCalledWith("alice");
  });

  it("returns null when tenant slug not found", async () => {
    vi.mocked(getTenantSiteId).mockResolvedValue(null);
    const req = mockRequest({ host: "unknown.caleno.co" });
    const result = await resolveSiteIdFromRequest(req);
    expect(result).toBeNull();
  });

  it("uses bodySiteId when provided", async () => {
    const req = mockRequest({ host: "caleno.co" });
    const result = await resolveSiteIdFromRequest(req, {
      bodySiteId: "body-site-id",
    });
    expect(result).toEqual({
      siteId: "body-site-id",
      tenantSlug: null,
      source: "body",
    });
  });

  it("returns null when no source has siteId", async () => {
    const req = mockRequest({ host: "caleno.co" });
    const result = await resolveSiteIdFromRequest(req);
    expect(result).toBeNull();
  });
});
