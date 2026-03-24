import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateSlug } from "@/lib/slug";

/**
 * GET /api/tenants/check-slug?slug=<slug>
 * Returns 200 { available: boolean, slug?: string } — same rule as checkout: taken iff tenants/{slug} exists.
 * (Avoid using /api/tenants/resolve for this: resolve 404 means "no site yet", which spams DevTools as an error.)
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("slug") ?? "";
  const v = validateSlug(raw);
  if (!v.ok) {
    return NextResponse.json(
      { available: false, error: v.error },
      { status: 400 }
    );
  }
  const slug = v.normalized;
  const snap = await getAdminDb().collection("tenants").doc(slug).get();
  return NextResponse.json({
    available: !snap.exists,
    slug,
  });
}
