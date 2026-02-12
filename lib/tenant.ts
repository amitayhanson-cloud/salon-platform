/**
 * Multi-tenant subdomain routing: single source of truth for classifying the request host.
 * Used by middleware to decide root app vs tenant subdomain.
 */

export type HostKind =
  | { kind: "root" }
  | { kind: "tenant"; slug: string };

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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
    if (slug && SLUG_REGEX.test(slug)) {
      return { kind: "tenant", slug };
    }
  }

  // e.g. alice.localhost (dev)
  if (hostLower.endsWith(".localhost")) {
    const slug = hostLower.slice(0, -".localhost".length);
    if (slug && SLUG_REGEX.test(slug)) {
      return { kind: "tenant", slug };
    }
  }

  return { kind: "root" };
}

/**
 * Slug validation for tenant creation: 3–30 chars, a-z 0-9 hyphen, no leading/trailing hyphen.
 */
export function isValidTenantSlug(slug: string): boolean {
  if (typeof slug !== "string") return false;
  const trimmed = slug.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 30) return false;
  return SLUG_REGEX.test(trimmed);
}

/**
 * Normalize slug for storage: lowercase, trim.
 */
export function normalizeTenantSlug(slug: string): string {
  return slug.trim().toLowerCase();
}
