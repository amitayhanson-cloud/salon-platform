import { NextRequest, NextResponse } from "next/server";
import { validateSlug } from "@/lib/slug";
import { getTenantBySlug } from "@/lib/tenant-data";

/**
 * GET /api/tenants/check?slug=<slug>
 * Returns 200 { available: true } if valid and not taken.
 * Returns 200 { available: false, reason?: string } if taken or invalid (reason for invalid).
 */
export async function GET(request: NextRequest) {
  const slugParam = request.nextUrl.searchParams.get("slug");
  if (!slugParam || typeof slugParam !== "string") {
    return NextResponse.json(
      { available: false, reason: "נא להזין תת-דומיין." },
      { status: 200 }
    );
  }

  const validation = validateSlug(slugParam);
  if (!validation.ok) {
    return NextResponse.json(
      { available: false, reason: validation.error },
      { status: 200 }
    );
  }

  const existing = await getTenantBySlug(validation.normalized);
  if (existing) {
    return NextResponse.json(
      { available: false, reason: "תת-דומיין זה תפוס." },
      { status: 200 }
    );
  }

  return NextResponse.json({ available: true }, { status: 200 });
}
