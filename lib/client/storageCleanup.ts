/**
 * Client-only: Centralized tenant storage cleanup.
 * Prevents stale tenant data, routing confusion, and cross-tenant state bleed.
 * Call on logout, account deletion, auth user change, and before tenant switch.
 */

const TENANT_KEY_PREFIXES = [
  "siteConfig:",
  "bookingState:",
  "latestSiteConfig:",
  "salonBookingState:",
] as const;
const AUTH_REDIRECT_KEYS = [
  "returnTo",
  "redirectTo",
  "redirect",
  "tenant",
  "tenantSlug",
  "slug",
  "siteId",
  "currentSite",
  "currentTenant",
] as const;

/**
 * Clear tenant storage for a specific site.
 * Call when leaving a site or on account deletion (with known siteId).
 */
export function clearTenantStorage(siteId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (siteId) {
      localStorage.removeItem(`siteConfig:${siteId}`);
      localStorage.removeItem(`bookingState:${siteId}`);
      sessionStorage.removeItem(`latestSiteConfig:${siteId}`);
    }
    // Also clear unkeyed legacy keys used during wizard (no site yet)
    sessionStorage.removeItem("latestSiteConfig");
  } catch {
    // ignore
  }
}

/**
 * Remove all keys starting with siteConfig:, bookingState:, latestSiteConfig:
 * Use on logout and account deletion for robust cleanup.
 */
export function clearAllTenantStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && TENANT_KEY_PREFIXES.some((p) => key.startsWith(p))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (TENANT_KEY_PREFIXES.some((p) => key.startsWith(p)) || key === "latestSiteConfig")) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Clear redirect-related keys that can cause wrong tenant routing.
 * Call on login page load, logout, and auth user change.
 */
export function clearAuthRedirectState(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of AUTH_REDIRECT_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/**
 * Full cleanup: tenant storage + auth redirect state.
 * Call on logout and account deletion.
 */
export function clearStaleStorageOnLogout(): void {
  clearAllTenantStorage();
  clearAuthRedirectState();
}
