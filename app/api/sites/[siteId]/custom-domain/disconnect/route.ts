/**
 * POST /api/sites/[siteId]/custom-domain/disconnect
 * Remove custom domain: delete domains mapping, clear site doc. Does not remove from Vercel (minimal scope).
 * Auth: Bearer token, site owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { removeCustomDomain, getCustomDomainForSite } from "@/lib/firestoreCustomDomain";
import { vercelRemoveDomain } from "@/lib/vercelDomains";

async function requireSiteOwner(
  token: string | null,
  siteId: string
): Promise<{ uid: string } | NextResponse> {
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) return NextResponse.json({ error: "site not found" }, { status: 404 });
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== decoded.uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  if (!siteId?.trim()) return NextResponse.json({ error: "missing siteId" }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const authResult = await requireSiteOwner(token, siteId);
  if (authResult instanceof NextResponse) return authResult;

  const { customDomain } = await getCustomDomainForSite(siteId);
  await removeCustomDomain(siteId);
  if (customDomain) {
    const removeResult = await vercelRemoveDomain(customDomain);
    if (!removeResult.ok && process.env.NODE_ENV !== "test") {
      console.warn("[custom-domain] disconnect: Vercel remove failed", { siteId, domain: customDomain, error: removeResult.error });
    }
  }
  if (process.env.NODE_ENV !== "test" && customDomain) {
    console.log("[custom-domain] disconnect", { siteId, domain: customDomain });
  }

  return NextResponse.json({ success: true, domain: null });
}
