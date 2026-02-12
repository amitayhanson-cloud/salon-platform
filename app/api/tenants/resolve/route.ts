import { NextRequest, NextResponse } from "next/server";
import { getTenantSiteId } from "@/lib/tenant-data";

/**
 * GET /api/tenants/resolve?slug=<slug>
 * Returns { siteId: string } or 404 if tenant not found / missing siteId.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !slug.trim()) {
    return NextResponse.json(
      { error: "Missing slug" },
      { status: 400 }
    );
  }

  const siteId = await getTenantSiteId(slug);
  if (!siteId) {
    return NextResponse.json(
      { error: "Tenant not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ siteId });
}
