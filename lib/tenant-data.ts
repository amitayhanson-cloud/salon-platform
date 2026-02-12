import { getAdminDb } from "@/lib/firebaseAdmin";

const TENANTS_COLLECTION = "tenants";

/** Public tenant fields only (safe to expose on tenant pages). */
export type TenantPublic = {
  slug: string;
};

/**
 * Fetch tenant by slug from Firestore (tenants collection, doc id = slug).
 * Returns only public fields. Returns null if not found or on error.
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
    const data = snap.data();
    if (!data) return null;
    return {
      slug: (data.slug as string) ?? normalized,
    };
  } catch {
    return null;
  }
}
