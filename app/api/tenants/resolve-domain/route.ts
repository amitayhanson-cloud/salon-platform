/**
 * GET /api/tenants/resolve-domain?host=<host>
 * Returns { siteId } for custom domain lookup. Used by middleware to route requests by Host header.
 * No auth (public routing). Host must be normalized (no port/path).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSiteIdByDomain } from "@/lib/firestoreCustomDomain";

export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host") ?? "";
  const trimmed = host.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "missing host" }, { status: 400 });
  }

  const siteId = await getSiteIdByDomain(trimmed);
  if (!siteId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ siteId });
}
