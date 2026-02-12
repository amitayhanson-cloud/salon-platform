/**
 * Server-only: resolve siteId from incoming request (host subdomain, query, or body).
 * Use in API routes that need to know the tenant/site. Uses Admin SDK via getTenantSiteId.
 */

import type { NextRequest } from "next/server";
import { getHostKind } from "./tenant";
import { getTenantSiteId } from "./tenant-data";

export type ResolveResult = {
  siteId: string;
  tenantSlug: string | null;
  source: "host" | "query_tenant" | "query_siteId" | "body";
};

/**
 * Resolve siteId from request.
 * - If host is <slug>.caleno.co (or .localhost): resolve tenants/<slug>.siteId.
 * - If localhost and ?tenant=<slug>: resolve tenants/<slug>.siteId.
 * - If ?siteId=...: use that (path/query convention).
 * - If bodySiteId provided (from POST body): use that.
 * Returns null if no siteId can be resolved.
 */
export async function resolveSiteIdFromRequest(
  request: NextRequest,
  options?: { bodySiteId?: string | null }
): Promise<ResolveResult | null> {
  const host = request.headers.get("host") ?? "";
  const hostLower = host.split(":")[0]?.toLowerCase() ?? "";

  // 1. Tenant subdomain: <slug>.caleno.co or <slug>.localhost
  const hostKind = getHostKind(host);
  if (hostKind.kind === "tenant") {
    const siteId = await getTenantSiteId(hostKind.slug);
    if (siteId) {
      if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
        console.debug("[resolveSiteId] host", { slug: hostKind.slug, siteId, source: "host" });
      }
      return { siteId, tenantSlug: hostKind.slug, source: "host" };
    }
  }

  // 2. Localhost with ?tenant=<slug>
  if (hostLower === "localhost") {
    const tenantParam = request.nextUrl.searchParams.get("tenant");
    if (tenantParam?.trim()) {
      const slug = tenantParam.trim().toLowerCase();
      const siteId = await getTenantSiteId(slug);
      if (siteId) {
        return { siteId, tenantSlug: slug, source: "query_tenant" };
      }
    }
  }

  // 3. Explicit ?siteId= (e.g. from client on root domain)
  const querySiteId = request.nextUrl.searchParams.get("siteId");
  if (typeof querySiteId === "string" && querySiteId.trim()) {
    return { siteId: querySiteId.trim(), tenantSlug: null, source: "query_siteId" };
  }

  // 4. From POST/body (caller passes after parsing body)
  if (options?.bodySiteId?.trim()) {
    return { siteId: options.bodySiteId.trim(), tenantSlug: null, source: "body" };
  }

  return null;
}
