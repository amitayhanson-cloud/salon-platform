import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";
import { getTenantForUid } from "@/lib/getTenantForUid";
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
 * Single source of truth: users/{uid} -> siteId, primarySlug. Never uses localStorage or host.
 * Returns 200 { url } for client to redirect, or 401 to send user to /login.
 * 403 + { error: "no_tenant" } when user doc missing or no siteId (client should sign out and show error).
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

    const uid = decoded.uid;
    const userDoc = await getServerUserDocument(uid);
    const rootOrigin = getRootOrigin();

    // User doc missing -> cannot determine tenant; client should sign out
    if (!userDoc) {
      if (process.env.NODE_ENV === "development") {
        console.log("[dashboard-redirect] uid=%s userDoc=null -> no_tenant", uid);
      }
      return NextResponse.json(
        { error: "no_tenant", message: "No tenant assigned" },
        { status: 403, headers: noCacheHeaders }
      );
    }

    // Single source of truth: getTenantForUid validates ownership (no fallbacks)
    const tenant = await getTenantForUid(uid);

    if (tenant) {
      const requestHost = request.headers.get("host") ?? "";
      const hostLower = requestHost.split(":")[0].toLowerCase();
      const isDevLocalhost =
        hostLower === "localhost" ||
        hostLower === "127.0.0.1" ||
        hostLower === "0.0.0.0";

      let targetUrl: string;
      if (isDevLocalhost) {
        // Stay on same origin in dev: Firebase Auth state is per-origin.
        if (tenant.slug) {
          const protocol = request.url.startsWith("https") ? "https" : "http";
          targetUrl = `${protocol}://${requestHost}/admin?tenant=${encodeURIComponent(tenant.slug)}`;
        } else {
          const protocol = request.url.startsWith("https") ? "https" : "http";
          targetUrl = `${protocol}://${requestHost}/site/${tenant.siteId}/admin`;
        }
      } else if (tenant.customDomain) {
        targetUrl = `https://${tenant.customDomain}/admin`;
      } else if (tenant.slug) {
        targetUrl = getSitePublicUrl(tenant.slug, "/admin");
      } else {
        targetUrl = new URL(`/site/${tenant.siteId}/admin`, rootOrigin).toString();
      }
      if (process.env.NODE_ENV === "development") {
        console.log("[dashboard-redirect] uid=%s requestHost=%s targetUrl=%s", uid, requestHost, targetUrl);
      }
      return NextResponse.json({ url: targetUrl }, { headers: noCacheHeaders });
    }

    const requestHost = request.headers.get("host") ?? "";
    const hostLower = requestHost.split(":")[0].toLowerCase();
    const isDevLocalhost =
      hostLower === "localhost" ||
      hostLower === "127.0.0.1" ||
      hostLower === "0.0.0.0";
    const builderUrl = isDevLocalhost
      ? `${request.url.startsWith("https") ? "https" : "http"}://${requestHost}/builder`
      : new URL("/builder", rootOrigin).toString();
    if (process.env.NODE_ENV === "development") {
      console.log("[dashboard-redirect] uid=%s userTenantId=null -> builder", uid);
    }
    return NextResponse.json(
      { url: builderUrl },
      { headers: noCacheHeaders }
    );
  } catch (err) {
    console.error("[dashboard-redirect]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
