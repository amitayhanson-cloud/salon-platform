import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { getTenantForUid } from "@/lib/getTenantForUid";
import { getSitePublicUrl } from "@/lib/tenant";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization",
};

/**
 * GET /api/tenants/me
 * Returns the current user's tenant slug and public URL.
 * Uses getTenantForUid (validates ownership). Never cached.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
    }

    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: NO_CACHE });
    }

    const tenant = await getTenantForUid(decoded.uid);
    if (!tenant) {
      return NextResponse.json({ slug: null, publicUrl: null, siteId: null }, { headers: NO_CACHE });
    }

    const slug = tenant.slug;
    const publicUrl = slug ? getSitePublicUrl(slug) : null;

    return NextResponse.json(
      { slug, publicUrl, siteId: tenant.siteId },
      { headers: NO_CACHE }
    );
  } catch (err) {
    console.error("[tenants/me]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
