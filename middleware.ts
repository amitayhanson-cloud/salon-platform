import { NextRequest, NextResponse } from "next/server";
import { getHostKind } from "@/lib/tenant";

/** Path prefixes we never rewrite (Next.js internals, API, static) */
const SKIP_PREFIXES = ["/_next", "/api", "/favicon.ico", "/favicon", "/static", "/images", "/brand"];

function shouldSkipRewrite(pathname: string): boolean {
  return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest): NextResponse {
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

  // Rewrite to /t/<slug>/<path>
  const base = `/t/${slug}`;
  const rewritePath = pathname === "/" ? base : `${base}${pathname}`;
  const rewriteUrl = new URL(rewritePath, request.url);
  // Preserve query params except tenant (avoid leaking into app)
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== "tenant") rewriteUrl.searchParams.set(key, value);
  });

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next (Next.js internals)
     * - api
     * - static files (common extensions)
     */
    "/((?!_next/|_next/static|api/|favicon.ico|favicon|static/|images/|brand/).*)",
  ],
};
