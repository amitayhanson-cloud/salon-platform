/**
 * Keys that might hold a previous user's tenant or redirect target.
 * Clear on login page load and logout so we never reuse another user's slug.
 * Do NOT rely on these for tenant resolution - always use users/{uid} from Firestore.
 */
const STALE_KEYS = [
  "returnTo",
  "redirectTo",
  "redirect",
  "tenant",
  "tenantSlug",
  "slug",
  "siteId",
  "currentSite",
  "currentTenant",
];

/**
 * Clear redirect/tenant-related keys from localStorage and sessionStorage.
 * Call on login page mount and on logout to prevent cross-tenant redirects.
 */
export function clearStaleRedirectStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of STALE_KEYS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
