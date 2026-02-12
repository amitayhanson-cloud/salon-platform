/**
 * Multi-tenant subdomain routing: single source of truth for classifying the request host.
 * Used by middleware to decide root app vs tenant subdomain.
 */

import { RESERVED_SLUGS, isValidSlugFormat, validateSlug, normalizeSlug } from "./slug";

export type HostKind =
  | { kind: "root" }
  | { kind: "tenant"; slug: string };

/** Re-export for backward compatibility */
export { RESERVED_SLUGS } from "./slug";

export function isReservedSlug(slug: string): boolean {
  if (typeof slug !== "string") return true;
  const lower = slug.trim().toLowerCase();
  return RESERVED_SLUGS.includes(lower);
}

/** Production root domain (no protocol). Derived from NEXT_PUBLIC_APP_URL or default. */
function getRootHost(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      // ignore invalid URL
    }
  }
  return "caleno.co";
}

/**
 * Returns true if the host is considered a "root" host (main app / marketing).
 * Root: caleno.co, www.caleno.co, localhost, *.vercel.app
 */
function isRootHost(hostLower: string): boolean {
  const root = getRootHost();
  if (hostLower === root) return true;
  if (hostLower === `www.${root}`) return true;
  if (hostLower === "localhost") return true;
  if (hostLower.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * Parse host and optionally detect tenant subdomain.
 * - Strips port (e.g. alice.caleno.co:3000 -> alice.caleno.co).
 * - Lowercases.
 * - Returns { kind: "root" } for caleno.co, www.caleno.co, localhost, *.vercel.app.
 * - Returns { kind: "tenant", slug } for <slug>.caleno.co when slug is valid.
 */
export function getHostKind(hostHeader: string): HostKind {
  if (!hostHeader || typeof hostHeader !== "string") {
    return { kind: "root" };
  }
  const withoutPort = hostHeader.split(":")[0] ?? hostHeader;
  const hostLower = withoutPort.trim().toLowerCase();
  if (!hostLower) return { kind: "root" };

  if (isRootHost(hostLower)) {
    return { kind: "root" };
  }

  // Tenant: <slug>.<root>
  const root = getRootHost();
  const suffix = `.${root}`;
  if (hostLower.endsWith(suffix)) {
    const slug = hostLower.slice(0, -suffix.length);
    if (slug && isValidSlugFormat(slug)) {
      return { kind: "tenant", slug };
    }
  }

  // e.g. alice.localhost (dev)
  if (hostLower.endsWith(".localhost")) {
    const slug = hostLower.slice(0, -".localhost".length);
    if (slug && isValidSlugFormat(slug)) {
      return { kind: "tenant", slug };
    }
  }

  return { kind: "root" };
}

/**
 * Slug validation for tenant creation. Delegates to validateSlug (lib/slug).
 * Returns same shape as before for backward compatibility (no normalized in success).
 */
export function isValidTenantSlug(slug: string): boolean {
  const r = validateSlug(slug);
  return r.ok;
}

/**
 * Full validation: format + not reserved. Use for create/change tenant.
 * Wraps validateSlug; returns { ok: true } (no normalized) for backward compatibility.
 */
export function validateTenantSlug(slug: string): { ok: true } | { ok: false; error: string } {
  const r = validateSlug(slug);
  if (r.ok) return { ok: true };
  return { ok: false, error: r.error };
}

/**
 * Normalize slug for storage. Uses lib/slug normalizeSlug.
 */
export function normalizeTenantSlug(slug: string): string {
  return normalizeSlug(slug);
}

/**
 * Public URL for a tenant subdomain (no trailing slash). path can be "" or "/admin" etc.
 */
export function getSitePublicUrl(slug: string, path: string = ""): string {
  const host =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
      : "caleno.co";
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `https://${slug}.${host}${p}`;
}

/**
 * Prefer subdomain URL when slug exists; otherwise internal /site/<siteId>/path.
 * Use for user-facing links so we hide siteId when slug is set.
 */
export function getSiteUrl(
  slug: string | null | undefined,
  siteId: string,
  path: string = ""
): string {
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  if (slug && slug.trim()) return getSitePublicUrl(slug.trim(), p);
  return `/site/${siteId}${p}`;
}
