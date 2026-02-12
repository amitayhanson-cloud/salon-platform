import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { getSlugBySiteId } from "@/lib/tenant-data";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";
import { getSitePublicUrl } from "@/lib/tenant";

/**
 * GET /api/tenants/me
 * Returns the current user's tenant slug and public URL (if any).
 * Auth: Bearer token (Firebase ID token).
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userDoc = await getServerUserDocument(decoded.uid);
    if (!userDoc?.siteId) {
      return NextResponse.json({ slug: null, publicUrl: null, siteId: null });
    }

    const slug = userDoc.primarySlug ?? (await getSlugBySiteId(userDoc.siteId));
    const publicUrl = slug ? getSitePublicUrl(slug) : null;

    return NextResponse.json({
      slug,
      publicUrl,
      siteId: userDoc.siteId,
    });
  } catch (err) {
    console.error("[tenants/me]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
