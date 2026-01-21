/**
 * Hook for admin pages to get the current user's site ID
 * Returns user.id (which is used as the site identifier in the new structure)
 * Works with both /site/[siteId]/admin and /site/me/admin routes
 */

import { useAuth } from "@/components/auth/AuthProvider";
import { useParams } from "next/navigation";

/**
 * Get the user ID to use for site operations in admin pages
 * - If on /site/me/admin, uses user.id from auth
 * - If on /site/[siteId]/admin, uses user.id (ignores route param for data operations)
 * 
 * @returns userId string or null if not authenticated
 */
export function useAdminSiteId(): string | null {
  const { user } = useAuth();
  const params = useParams();
  const routeSiteId = params?.siteId as string | undefined;
  
  // Always use user.id for data operations (single source of truth)
  // Route siteId is only for display/URL purposes
  if (!user) {
    return null;
  }
  
  return user.id;
}
