/**
 * Next.js middleware (proxy): tenant resolution ONLY. No auth gating.
 * Firebase client auth (no session cookies) - middleware CANNOT verify auth.
 * All auth protection is client-side. NEVER redirects to /login.
 */
import { NextRequest, NextResponse } from "next/server";
import { getHostKind, isPlatformHost } from "@/lib/tenant";

/** Path prefixes we never rewrite (Next.js internals, API, static assets) */
const SKIP_PREFIXES = [
  "/_next",
  "/api",
  "/favicon.ico",
  "/favicon",
  "/static",
  "/images",
  "/brand",
  "/templates",
  "/robots.txt",
  "/sitemap.xml",
  "/not-found-tenant",
];

/** Auth paths: never rewritten on tenant subdomains — serve same as root so redirect uses current user */
const TENANT_PASSTHROUGH_PREFIXES = ["/login", "/signup", "/register", "/forgot-password", "/account"];

function shouldSkipRewrite(pathname: string): boolean {
  return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isTenantPassthroughPath(pathname: string): boolean {
  return TENANT_PASSTHROUGH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[MW]", pathname);
  }

  // Normalize host: strip port, lowercase, trim (used for routing and custom-domain lookup).
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase().trim();

  if (shouldSkipRewrite(pathname)) {
    return NextResponse.next();
  }

  // localhost is a dev host and should not be treated as a tenant custom domain.
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local");

  // Dev override: on local host, ?tenant=alice behaves like alice.caleno.co
  const tenantFromQuery = isLocalHost ? request.nextUrl.searchParams.get("tenant") : null;
  const effectiveSlug =
    tenantFromQuery?.trim().toLowerCase() && tenantFromQuery.length >= 1
      ? tenantFromQuery.trim().toLowerCase()
      : null;

  let slug: string | null = null;
  const hostKind = getHostKind(host);
  if (effectiveSlug) {
    slug = effectiveSlug;
  } else if (hostKind.kind === "tenant") {
    slug = hostKind.slug;
  }

  if (process.env.NODE_ENV === "development") {
    const decision = slug ? "tenant" : isPlatformHost(host) ? "platform" : "custom";
    // eslint-disable-next-line no-console
    console.log("[proxy] host=%s decision=%s slug=%s", host, decision, slug ?? "(none)");
  }

  const origin = new URL(request.url).origin;
  let siteId: string | null = null;

  if (slug) {
    // Subdomain: resolve slug -> siteId via API
    if (isTenantPassthroughPath(pathname)) {
      return NextResponse.next();
    }
    try {
      const res = await fetch(`${origin}/api/tenants/resolve?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as { siteId?: string };
        if (typeof data.siteId === "string" && data.siteId.trim()) {
          siteId = data.siteId.trim();
        }
      }
    } catch {
      // fall through
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[proxy] tenant slug=%s resolved tenantId=%s", slug, siteId ?? "(none)");
    }
    if (!siteId) {
      const notFoundUrl = new URL("/not-found-tenant", request.url);
      return NextResponse.rewrite(notFoundUrl);
    }
  } else {
    // Platform host (caleno.co, www.caleno.co, localhost, 127.0.0.1, *.vercel.app): never do tenant lookup.
    if (isPlatformHost(host)) {
      return NextResponse.next();
    }
    // Custom domain: resolve host -> siteId via API (domains collection).
    try {
      const res = await fetch(
        `${origin}/api/tenants/resolve-domain?host=${encodeURIComponent(host)}`
      );
      if (res.ok) {
        const data = (await res.json()) as { siteId?: string };
        if (typeof data.siteId === "string" && data.siteId.trim()) {
          siteId = data.siteId.trim();
        }
      }
    } catch {
      // fall through
    }
    if (!siteId) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("[proxy] custom domain host=%s resolved tenantId=(none) → not-found-tenant", host);
      }
      const notFoundUrl = new URL("/not-found-tenant", request.url);
      return NextResponse.rewrite(notFoundUrl);
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[proxy] custom domain host=%s resolved tenantId=%s", host, siteId);
    }
    if (isTenantPassthroughPath(pathname)) {
      return NextResponse.next();
    }
  }

  // Rewrite to /site/<siteId>/ or /site/<siteId><path>
  const siteBase = `/site/${siteId}`;
  const rewritePath = pathname === "/" ? `${siteBase}/` : `${siteBase}${pathname}`;
  const rewriteUrl = new URL(rewritePath, request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== "tenant") rewriteUrl.searchParams.set(key, value);
  });

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: [
    "/((?!_next/|_next/static|api/|favicon.ico|favicon|static/|images/|brand/|templates/|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export default proxy;
