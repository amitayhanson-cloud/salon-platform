/**
 * GET /api/sites/[siteId]/custom-domain/status
 * Return current custom domain and status; optionally fresh config from Vercel (DNS instructions).
 * Auth: Bearer token, site owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { getCustomDomainForSite } from "@/lib/firestoreCustomDomain";
import { vercelGetDomainConfig, buildRecordsToAdd } from "@/lib/vercelDomains";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  if (!siteId?.trim()) return NextResponse.json({ error: "missing siteId" }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const authResult = await requireSiteOwner(token, siteId);
  if (authResult instanceof NextResponse) return authResult;

  const { customDomain, customDomainStatus } = await getCustomDomainForSite(siteId);

  const refresh = request.nextUrl.searchParams.get("refresh") === "true" && customDomain;
  let config: {
    misconfigured: boolean;
    configuredBy: string | null;
    recommendedCNAME?: Array<{ rank: number; value: string }>;
    recommendedIPv4?: Array<{ rank: number; value: string[] }>;
    recordsToAdd?: Array<{ type: string; name: string; value: string }>;
  } | null = null;

  if (refresh && customDomain) {
    const res = await vercelGetDomainConfig(customDomain);
    if (res.ok) {
      config = {
        misconfigured: res.misconfigured,
        configuredBy: res.configuredBy,
        recommendedCNAME: res.recommendedCNAME,
        recommendedIPv4: res.recommendedIPv4,
        recordsToAdd: buildRecordsToAdd(res, customDomain),
      };
    }
  }

  return NextResponse.json({
    domain: customDomain,
    status: customDomainStatus ?? "none",
    config,
  });
}
