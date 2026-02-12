/**
 * Server-only: read user document using Firebase Admin SDK.
 * Use in API routes and server code. Do NOT import from firebaseClient or firestoreUsers (client) in API routes.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";

const USERS_COLLECTION = "users";

export type ServerUserDoc = {
  id: string;
  email: string;
  name?: string;
  siteId: string | null;
  primarySlug?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

function toDate(v: unknown): Date {
  if (v == null) return new Date(0);
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === "number") return new Date(v);
  return new Date(0);
}

/**
 * Get user document by uid using Admin SDK. Returns null if not found or on error.
 */
export async function getServerUserDocument(uid: string): Promise<ServerUserDoc | null> {
  if (!uid || typeof uid !== "string" || !uid.trim()) return null;
  try {
    const db = getAdminDb();
    const snap = await db.collection(USERS_COLLECTION).doc(uid.trim()).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data) return null;
    return {
      id: snap.id,
      email: typeof data.email === "string" ? data.email : "",
      name: typeof data.name === "string" ? data.name : undefined,
      siteId: typeof data.siteId === "string" && data.siteId ? data.siteId : null,
      primarySlug: typeof data.primarySlug === "string" && data.primarySlug ? data.primarySlug : null,
      createdAt: toDate(data.createdAt),
      updatedAt: data.updatedAt != null ? toDate(data.updatedAt) : undefined,
    };
  } catch (err) {
    console.error("[firestoreUsersServer] getServerUserDocument error:", err);
    return null;
  }
}

const WEBSITES_COLLECTION = "websites";

/**
 * Update user's siteId using Admin SDK. Use in API routes only.
 */
export async function updateUserSiteIdServer(uid: string, siteId: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(USERS_COLLECTION).doc(uid);
  await ref.set({ siteId, updatedAt: new Date() }, { merge: true });
}

/**
 * Create a website document in "websites" collection using Admin SDK. Returns the new doc id.
 * Throws if subdomain already taken. Use in API routes only.
 */
export async function createWebsiteDocumentServer(
  ownerUserId: string,
  subdomain: string,
  templateId: string = "luxury"
): Promise<{ id: string }> {
  const db = getAdminDb();
  const q = db.collection(WEBSITES_COLLECTION).where("subdomain", "==", subdomain);
  const snap = await q.get();
  if (!snap.empty) {
    throw new Error("Subdomain already taken");
  }
  const ref = db.collection(WEBSITES_COLLECTION).doc();
  const now = new Date();
  await ref.set({
    ownerUserId,
    templateId,
    subdomain,
    setupStatus: "not_started",
    createdAt: now,
    updatedAt: now,
    isActive: true,
  });
  return { id: ref.id };
}
