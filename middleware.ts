import { NextRequest, NextResponse } from "next/server";
import { getHostKind } from "@/lib/tenant";

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

/** Auth and dashboard paths: never rewritten on tenant subdomains — serve same as root so redirect uses current user */
const TENANT_PASSTHROUGH_PREFIXES = ["/login", "/signup", "/register", "/forgot-password", "/account", "/dashboard"];

function shouldSkipRewrite(pathname: string): boolean {
  return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isTenantPassthroughPath(pathname: string): boolean {
  return TENANT_PASSTHROUGH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;

  if (shouldSkipRewrite(pathname)) {
    return NextResponse.next();
  }

  // Dev override: on localhost, ?tenant=alice behaves like alice.caleno.co
  const isLocalhost = host.split(":")[0]?.toLowerCase() === "localhost";
  const tenantFromQuery = isLocalhost ? request.nextUrl.searchParams.get("tenant") : null;
  const effectiveSlug =
    tenantFromQuery?.trim().toLowerCase() && tenantFromQuery.length >= 1
      ? tenantFromQuery.trim().toLowerCase()
      : null;

  let slug: string | null = null;

  if (effectiveSlug) {
    slug = effectiveSlug;
  } else {
    const hostKind = getHostKind(host);
    if (hostKind.kind === "tenant") {
      slug = hostKind.slug;
    }
  }

  if (!slug) {
    return NextResponse.next();
  }

  // Auth and account paths: do not rewrite on tenant subdomain (serve same as root)
  if (isTenantPassthroughPath(pathname)) {
    return NextResponse.next();
  }

  // Resolve slug -> siteId via API (same origin, /api excluded from matcher)
  const origin = new URL(request.url).origin;
  const resolveUrl = `${origin}/api/tenants/resolve?slug=${encodeURIComponent(slug)}`;
  let siteId: string | null = null;
  try {
    const res = await fetch(resolveUrl);
    if (res.ok) {
      const data = (await res.json()) as { siteId?: string };
      if (typeof data.siteId === "string" && data.siteId.trim()) {
        siteId = data.siteId.trim();
      }
    }
  } catch {
    // fall through to tenant-not-found
  }

  if (!siteId) {
    const notFoundUrl = new URL("/not-found-tenant", request.url);
    return NextResponse.rewrite(notFoundUrl);
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
