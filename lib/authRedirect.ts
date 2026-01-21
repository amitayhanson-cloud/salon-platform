/**
 * Simplified auth redirect logic
 * Single source of truth: users/{uid}.siteId
 * - If siteId exists → go to /site/{siteId}/admin
 * - If siteId missing → go to /builder
 */

import { getUserDocument, createUserDocument } from "./firestoreUsers";

/**
 * Route after authentication based on whether user has a siteId
 * This is the SINGLE function that decides where to go after auth
 * 
 * @param userId - Firebase Auth UID
 * @returns Redirect path: "/builder" or "/site/{siteId}/admin"
 */
export async function routeAfterAuth(userId: string): Promise<string> {
  try {
    // Get user document
    let userDoc = await getUserDocument(userId);
    
    // If user doc doesn't exist, create it
    if (!userDoc) {
      console.log(`[routeAfterAuth] User doc not found for uid=${userId}, creating`);
      try {
        await createUserDocument(userId, "", "");
        userDoc = await getUserDocument(userId);
      } catch (error) {
        console.error("[routeAfterAuth] Error creating user doc:", error);
        return "/builder";
      }
    }

    // Check if user has a siteId
    const siteId = userDoc?.siteId;
    
    // Debug log (dev only, no secrets)
    if (process.env.NODE_ENV === "development") {
      const redirectPath = siteId ? `/site/${siteId}/admin` : "/builder";
      console.log(`[routeAfterAuth] uid=${userId}, siteId=${siteId || "null"} -> redirect=${redirectPath}`);
    }

    // If siteId exists → go to admin
    if (siteId) {
      return `/site/${siteId}/admin`;
    }

    // No siteId → go to wizard
    return "/builder";
  } catch (error) {
    console.error("[routeAfterAuth] Error:", error);
    return "/builder";
  }
}
