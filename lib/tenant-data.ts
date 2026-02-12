import { getAdminDb } from "@/lib/firebaseAdmin";

const TENANTS_COLLECTION = "tenants";

/** Tenant doc shape: doc id = slug, fields include siteId. */
export type TenantDoc = {
  siteId: string;
  ownerUid?: string;
  createdAt: unknown;
  updatedAt: unknown;
};

/** Public tenant fields only (safe to expose). */
export type TenantPublic = {
  slug: string;
  siteId: string;
};

/**
 * Fetch tenant by slug from Firestore (tenants collection, doc id = slug).
 * Returns public fields { slug, siteId } or null if not found / missing siteId.
 */
export async function getTenantBySlug(slug: string): Promise<TenantPublic | null> {
  if (!slug || typeof slug !== "string") {
    return null;
  }
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const db = getAdminDb();
    const docRef = db.collection(TENANTS_COLLECTION).doc(normalized);
    const snap = await docRef.get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() as TenantDoc | undefined;
    if (!data || typeof data.siteId !== "string" || !data.siteId.trim()) {
      return null;
    }
    return {
      slug: normalized,
      siteId: data.siteId.trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve slug to siteId only. For middleware/API use.
 */
export async function getTenantSiteId(slug: string): Promise<string | null> {
  const tenant = await getTenantBySlug(slug);
  return tenant?.siteId ?? null;
}

/**
 * Get slug for a site (from sites doc). Returns null if site has no slug.
 */
export async function getSlugBySiteId(siteId: string): Promise<string | null> {
  if (!siteId || typeof siteId !== "string" || !siteId.trim()) return null;
  try {
    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId.trim()).get();
    if (!siteSnap.exists) return null;
    const slug = (siteSnap.data() as { slug?: string } | undefined)?.slug;
    return typeof slug === "string" && slug.trim() ? slug.trim() : null;
  } catch {
    return null;
  }
}
