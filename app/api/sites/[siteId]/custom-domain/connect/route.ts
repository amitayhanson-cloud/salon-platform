/**
 * POST /api/sites/[siteId]/custom-domain/connect
 * Add a custom domain for the site. Validates domain, checks duplicate, writes Firestore, calls Vercel add domain, returns DNS instructions.
 * Auth: Bearer token, site owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { validateDomain, normalizeDomain } from "@/lib/customDomain";
import {
  setCustomDomain,
  getSiteIdByDomainOnly,
  getCustomDomainForSite,
  updateCustomDomainStatus,
} from "@/lib/firestoreCustomDomain";
import { vercelAddDomain, vercelGetDomainConfig, buildRecordsToAdd } from "@/lib/vercelDomains";

async function requireSiteOwner(
  token: string | null,
  siteId: string
): Promise<{ uid: string } | NextResponse> {
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return { uid };
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  if (!siteId?.trim()) {
    return NextResponse.json({ error: "missing siteId" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const authResult = await requireSiteOwner(token, siteId);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => ({}));
  const domainInput = (body?.domain ?? body?.name ?? "").trim();
  if (!domainInput) {
    return NextResponse.json(
      { error: "missing domain", message: "נא להזין דומיין." },
      { status: 400 }
    );
  }

  const validation = validateDomain(domainInput);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "invalid_domain", message: validation.error },
      { status: 400 }
    );
  }
  const domain = validation.domain;

  // One custom domain per site: if site already has a different domain, reject
  const existing = await getCustomDomainForSite(siteId);
  const existingNorm = existing.customDomain ? normalizeDomain(existing.customDomain) : "";
  if (existingNorm && existingNorm !== domain) {
    return NextResponse.json(
      { error: "already_has_domain", message: "כבר מוגדר דומיין אחר לאתר. נתק אותו קודם." },
      { status: 400 }
    );
  }

  // Prevent duplicate: domain must not be assigned to another site
  const otherSiteId = await getSiteIdByDomainOnly(domain);
  if (otherSiteId && otherSiteId !== siteId) {
    return NextResponse.json(
      { error: "domain_taken", message: "הדומיין כבר משויך לאתר אחר." },
      { status: 409 }
    );
  }

  // Write Firestore as pending, then add to Vercel
  const setResult = await setCustomDomain(siteId, domain, "pending");
  if (!setResult.ok) {
    return NextResponse.json(
      { error: "set_failed", message: setResult.error },
      { status: 400 }
    );
  }

  const addResult = await vercelAddDomain(domain);
  if (!addResult.ok) {
    return NextResponse.json(
      {
        error: "vercel_failed",
        message: addResult.error ?? "Vercel API error",
        status: addResult.status,
      },
      { status: addResult.status >= 500 ? 502 : 400 }
    );
  }

  const configResult = await vercelGetDomainConfig(domain);
  const misconfigured = configResult.ok ? configResult.misconfigured : true;
  const status = addResult.verified && !misconfigured ? "verified" : misconfigured ? "misconfigured" : "pending";
  if (status !== "pending") {
    await updateCustomDomainStatus(siteId, domain, status);
  }

  const recordsToAdd = configResult.ok ? buildRecordsToAdd(configResult, domain) : [];
  const notes: string[] = [];
  if (addResult.verification?.length) {
    addResult.verification.forEach((v) => {
      if (v.type === "TXT") notes.push(`TXT ${v.domain}: ${v.value}`);
    });
  }

  if (process.env.NODE_ENV !== "test") {
    console.log("[custom-domain] connect", { siteId, domain, status });
  }

  return NextResponse.json({
    success: true,
    domain,
    status,
    verified: addResult.verified ?? false,
    dns: {
      recordsToAdd,
      notes,
      misconfigured,
      verification: addResult.verification ?? [],
    },
  });
}
