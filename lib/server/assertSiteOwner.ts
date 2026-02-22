/**
 * Server-only: Verify that the authenticated user owns the site.
 * Uses sites/{siteId}.ownerUid === uid (or ownerUserId for legacy).
 */

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * Check that uid owns siteId. Returns null if allowed, or a 403/404 NextResponse if not.
 */
export async function assertSiteOwner(uid: string, siteId: string): Promise<NextResponse | null> {
  if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
    return NextResponse.json({ error: "site not found", message: "Invalid siteId" }, { status: 404 });
  }

  const db = getAdminDb();
  const siteDoc = await db.collection("sites").doc(siteId.trim()).get();

  if (!siteDoc.exists) {
    return NextResponse.json({ error: "site not found", message: "Site not found" }, { status: 404 });
  }

  const data = siteDoc.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
  const ownerUid = data?.ownerUid ?? data?.ownerUserId;

  if (ownerUid !== uid) {
    return NextResponse.json({ error: "forbidden", message: "You do not have access to this site" }, { status: 403 });
  }

  return null;
}
