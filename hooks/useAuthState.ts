/**
 * Shared auth state hook
 * Provides stable auth state for route guards
 */

import { useAuth } from "@/components/auth/AuthProvider";

export function useAuthState() {
  const { user, loading, authReady } = useAuth();
  
  return {
    user,
    loading,
    authReady,
    userId: user?.id || null,
    siteId: user?.siteId || null,
  };
}
