/**
 * Simplified auth redirect logic.
 * Single source of truth: users/{uid}.siteId and users/{uid}.primarySlug.
 * Returns path + slug + siteId so caller can build subdomain URL when slug exists.
 */

import { getUserDocument, createUserDocument } from "./firestoreUsers";

export type RouteAfterAuthResult = {
  path: string;
  slug: string | null;
  siteId: string | null;
};

/**
 * Route after authentication based on whether user has a siteId.
 * Caller should use getDashboardUrl({ slug, siteId }) when siteId is set to get subdomain or path.
 *
 * @param userId - Firebase Auth UID
 * @returns { path, slug, siteId } — path is /builder or /site/{siteId}/admin; slug from user.primarySlug
 */
export async function routeAfterAuth(userId: string): Promise<RouteAfterAuthResult> {
  try {
    let userDoc = await getUserDocument(userId);

    if (!userDoc) {
      console.log(`[routeAfterAuth] User doc not found for uid=${userId}, creating`);
      try {
        await createUserDocument(userId, "", "");
        userDoc = await getUserDocument(userId);
      } catch (error) {
        console.error("[routeAfterAuth] Error creating user doc:", error);
        return { path: "/builder", slug: null, siteId: null };
      }
    }

    const siteId = userDoc?.siteId ?? null;
    const slug = userDoc?.primarySlug ?? null;
    const path = siteId ? `/site/${siteId}/admin` : "/builder";

    if (process.env.NODE_ENV === "development") {
      console.log(`[routeAfterAuth] uid=${userId}, siteId=${siteId ?? "null"}, slug=${slug ?? "null"} -> path=${path}`);
    }

    return { path, slug, siteId };
  } catch (error) {
    console.error("[routeAfterAuth] Error:", error);
    return { path: "/builder", slug: null, siteId: null };
  }
}
