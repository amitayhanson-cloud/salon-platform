/**
 * Single source of truth: user UID -> tenant mapping.
 * Direct doc read users/{uid}; NO queries over sites collection; NO limit(1).
 * Validates ownership: sites/{siteId}.ownerUid === uid.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";
import { getSlugBySiteId } from "@/lib/tenant-data";
import { getCustomDomainForSite } from "@/lib/firestoreCustomDomain";

export type TenantForUid = {
  siteId: string;
  slug: string | null;
  customDomain: string | null;
};

/**
 * Get tenant for user. Returns null if no tenant assigned or ownership invalid.
 * NEVER queries all sites or uses limit(1). Strict users/{uid} read + ownership check.
 */
export async function getTenantForUid(uid: string): Promise<TenantForUid | null> {
  if (!uid || typeof uid !== "string" || !uid.trim()) return null;

  const userDoc = await getServerUserDocument(uid.trim());
  if (!userDoc?.siteId) return null;

  const siteId = userDoc.siteId;

  // Validate ownership: sites/{siteId}.ownerUid === uid
  const db = getAdminDb();
  const siteSnap = await db.collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return null;
  const ownerUid = (siteSnap.data() as { ownerUid?: string })?.ownerUid;
  if (ownerUid !== uid) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getTenantForUid] ownership mismatch", { uid, siteId, ownerUid });
    }
    return null;
  }

  const slug = userDoc.primarySlug ?? (await getSlugBySiteId(siteId));
  const { customDomain, customDomainStatus } = await getCustomDomainForSite(siteId);
  const customDomainValid =
    customDomain &&
    customDomain.trim() &&
    customDomainStatus === "verified"
      ? customDomain.trim()
      : null;

  return { siteId, slug, customDomain: customDomainValid };
}
