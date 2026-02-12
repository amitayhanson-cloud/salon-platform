import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";
import { getSlugBySiteId } from "@/lib/tenant-data";
import { getSitePublicUrl } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Root origin for redirects (no trailing slash).
 */
function getRootOrigin(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
  }
  return "https://caleno.co";
}

/**
 * GET /api/dashboard-redirect
 * Auth: Bearer <Firebase ID token> in Authorization header.
 * Returns 200 { url } for client to redirect, or 401 to send user to /login.
 * Server-only: Firebase Admin SDK only.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const noCacheHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    };
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
    }

    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
    }

    const userDoc = await getServerUserDocument(decoded.uid);
    const rootOrigin = getRootOrigin();

    if (userDoc?.siteId) {
      const slug =
        userDoc.primarySlug ?? (await getSlugBySiteId(userDoc.siteId));
      if (slug) {
        const adminUrl = getSitePublicUrl(slug, "/admin");
        return NextResponse.json({ url: adminUrl }, { headers: noCacheHeaders });
      }
      return NextResponse.json(
        { url: new URL(`/site/${userDoc.siteId}/admin`, rootOrigin).toString() },
        { headers: noCacheHeaders }
      );
    }

    return NextResponse.json(
      { url: new URL("/builder", rootOrigin).toString() },
      { headers: noCacheHeaders }
    );
  } catch (err) {
    console.error("[dashboard-redirect]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
