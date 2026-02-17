/**
 * POST /api/sites/[siteId]/custom-domain/verify
 * Call Vercel verify, re-check config, update Firestore status (verified / misconfigured / pending).
 * Auth: Bearer token, site owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { updateCustomDomainStatus, getCustomDomainForSite } from "@/lib/firestoreCustomDomain";
import { vercelVerifyDomain, vercelGetDomainConfig, buildRecordsToAdd } from "@/lib/vercelDomains";
import type { CustomDomainStatus } from "@/lib/customDomain";

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

  const body = await request.json().catch(() => ({}));
  const bodyDomain = (body?.domain ?? "").trim();
  const { customDomain: siteDomain } = await getCustomDomainForSite(siteId);
  const domain = bodyDomain || siteDomain?.trim() || "";
  if (!domain) {
    return NextResponse.json(
      { error: "no_domain", message: "אין דומיין מותאם לאתר." },
      { status: 400 }
    );
  }

  const verifyResult = await vercelVerifyDomain(domain);
  if (!verifyResult.ok) {
    return NextResponse.json(
      { error: "vercel_failed", message: verifyResult.error },
      { status: verifyResult.status >= 500 ? 502 : 400 }
    );
  }

  const configResult = await vercelGetDomainConfig(domain);
  let status: CustomDomainStatus = "pending";
  if (configResult.ok) {
    if (verifyResult.verified && !configResult.misconfigured) status = "verified";
    else if (configResult.misconfigured) status = "misconfigured";
  }

  await updateCustomDomainStatus(siteId, domain, status);

  if (process.env.NODE_ENV !== "test") {
    console.log("[custom-domain] verify", { siteId, domain, status });
  }

  const recordsToAdd = configResult.ok ? buildRecordsToAdd(configResult, domain) : [];
  return NextResponse.json({
    success: true,
    domain,
    status,
    verified: verifyResult.verified ?? false,
    misconfigured: configResult.ok ? configResult.misconfigured : true,
    dns: { recordsToAdd },
  });
}
