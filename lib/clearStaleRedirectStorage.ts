import { clearAuthRedirectState, clearAllTenantStorage } from "@/lib/client/storageCleanup";

/**
 * Clear redirect/tenant-related keys from localStorage and sessionStorage.
 * Call on login page mount and on logout to prevent cross-tenant redirects.
 * Also clears tenant-specific storage to prevent stale/cross-tenant state.
 */
export function clearStaleRedirectStorage(): void {
  clearAuthRedirectState();
  clearAllTenantStorage();
}
