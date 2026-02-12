/**
 * Base URL and host helpers for redirects and links.
 * Use these instead of env-based hardcoded URLs so tenant subdomain is preserved.
 *
 * Manual test steps (subdomain canonical URL):
 * 1. Visit https://<slug>.caleno.co/admin logged out → goes to login → after login returns to same subdomain (/admin).
 * 2. Once logged in, refresh on subdomain admin and confirm URL stays on subdomain (no redirect to /site/<id>).
 * 3. Root URL https://caleno.co/site/<id>/admin still works on root.
 */

import type { NextRequest } from "next/server";

/** Root hostname (e.g. "caleno.co"). Uses NEXT_PUBLIC_APP_URL when available. */
export function getRootHost(): string {
  if (typeof process === "undefined" || !process.env) return "caleno.co";
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      // ignore
    }
  }
  return "caleno.co";
}

/** User doc shape for slug resolution. Prefer primarySlug; fallback is from sites/<siteId>.slug (API). */
export type UserDocForSlug = {
  siteId?: string | null;
  primarySlug?: string | null;
};

/**
 * Returns the tenant slug for a user doc. Prefer users/<uid>.primarySlug.
 * Caller may use /api/tenants/me for resolved slug (primarySlug ?? sites/<siteId>.slug).
 */
export function getTenantSlugForUser(userDoc: UserDocForSlug | null | undefined): string | null {
  if (!userDoc) return null;
  const s = userDoc.primarySlug;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

/**
 * Full dashboard URL or path for redirects/links.
 * - If slug exists: full URL (subdomain). On localhost: http://localhost:3000/admin?tenant=<slug>.
 * - Else: path /site/<siteId>/admin for in-app navigation.
 * Use for "Go to dashboard" and post-login redirects. If result starts with "http", use window.location.href.
 */
export function getDashboardUrl(params: { slug: string | null; siteId: string | null }): string {
  const { slug, siteId } = params;
  if (!siteId || siteId === "me") return "/site/me/admin";

  const hasSlug = typeof slug === "string" && slug.trim().length > 0;
  if (typeof window !== "undefined" && window.location.hostname === "localhost" && hasSlug) {
    return `http://localhost:3000/admin?tenant=${encodeURIComponent(slug!.trim())}`;
  }
  if (hasSlug) {
    const root = getRootHost();
    return `https://${slug!.trim()}.${root}/admin`;
  }
  return `/site/${siteId}/admin`;
}

/**
 * Admin URL with optional path (e.g. "/bookings", "/settings").
 * Same rules as getDashboardUrl; path is appended.
 */
export function getAdminUrl(params: {
  slug: string | null;
  siteId: string | null;
  path?: string;
}): string {
  const { slug, siteId, path = "" } = params;
  const normalizedPath = path.startsWith("/") ? path : path ? `/${path}` : "";
  if (!siteId || siteId === "me") return `/site/me/admin${normalizedPath}`;

  const hasSlug = typeof slug === "string" && slug.trim().length > 0;
  if (typeof window !== "undefined" && window.location.hostname === "localhost" && hasSlug) {
    const base = `http://localhost:3000/admin?tenant=${encodeURIComponent(slug!.trim())}`;
    return normalizedPath ? `${base}${normalizedPath}` : base;
  }
  if (hasSlug) {
    const root = getRootHost();
    return `https://${slug!.trim()}.${root}/admin${normalizedPath}`;
  }
  return `/site/${siteId}/admin${normalizedPath}`;
}

/**
 * Server: build base URL from the incoming request (host + protocol).
 * Use in API routes and middleware. Preserves tenant subdomain (e.g. https://slug.caleno.co).
 */
export function getBaseUrlFromRequest(request: NextRequest): string {
  const host = request.headers.get("host") ?? "";
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : request.url.startsWith("https://")
        ? "https"
        : "http";
  return `${proto}://${host}`;
}

/**
 * Client only: current origin (e.g. https://slug.caleno.co or https://caleno.co).
 * Use for redirects and links so we stay on the same host.
 */
export function getBaseUrlClient(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * Client only: true when the current host is a tenant subdomain
 * (e.g. mysalon.caleno.co), false on root (caleno.co, www.caleno.co, localhost).
 */
export function isOnTenantSubdomainClient(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  const root = getRootHost();
  if (host === "localhost") return false;
  if (host === root || host === `www.${root}`) return false;
  if (host.endsWith(".vercel.app")) return false;
  if (host.endsWith(`.${root}`)) return true;
  if (host.endsWith(".localhost")) return true;
  return false;
}

/**
 * Admin base path for redirects and links.
 * On tenant subdomain: /admin (canonical on subdomain).
 * On root: /site/<siteId>/admin.
 */
export function getAdminBasePath(
  siteId: string,
  onTenantSubdomain: boolean
): string {
  if (onTenantSubdomain) return "/admin";
  return `/site/${siteId}/admin`;
}

/** Hook-friendly: pass siteId from useParams(), returns same as getAdminBasePath(siteId, isOnTenantSubdomainClient()). */
export function getAdminBasePathFromSiteId(siteId: string | null): string {
  if (!siteId || siteId === "me") return "/site/me/admin";
  return getAdminBasePath(siteId, isOnTenantSubdomainClient());
}
