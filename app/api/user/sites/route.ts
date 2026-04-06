import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";
import { normalizeOwnedSiteIds } from "@/lib/normalizeUserOwnedSites";
import { getSlugBySiteId } from "@/lib/tenant-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization",
};

export type UserSiteSummary = {
  siteId: string;
  slug: string | null;
  salonName: string;
  isPrimary: boolean;
};

/**
 * GET /api/user/sites
 * All sites owned by the authenticated user (ownerUid match). Used by /account hub.
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

    const uid = decoded.uid;
    const userDoc = await getServerUserDocument(uid);
    if (!userDoc) {
      return NextResponse.json({ sites: [] as UserSiteSummary[] }, { headers: NO_CACHE });
    }

    const ids = normalizeOwnedSiteIds(userDoc.ownedSiteIds, userDoc.siteId);
    if (ids.length === 0) {
      return NextResponse.json({ sites: [] as UserSiteSummary[] }, { headers: NO_CACHE });
    }

    const db = getAdminDb();
    const primaryId = userDoc.siteId;
    const sites: UserSiteSummary[] = [];

    for (const siteId of ids) {
      const snap = await db.collection("sites").doc(siteId).get();
      if (!snap.exists) continue;
      const d = snap.data() as { ownerUid?: string; config?: { salonName?: string } } | undefined;
      if (!d || d.ownerUid !== uid) continue;
      const slug = await getSlugBySiteId(siteId);
      const rawName = d.config?.salonName;
      const salonName =
        typeof rawName === "string" && rawName.trim() ? rawName.trim() : "אתר ללא שם";
      sites.push({
        siteId,
        slug,
        salonName,
        isPrimary: primaryId != null && siteId === primaryId,
      });
    }

    sites.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.salonName.localeCompare(b.salonName, "he");
    });

    return NextResponse.json({ sites }, { headers: NO_CACHE });
  } catch (err) {
    console.error("[user/sites]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
