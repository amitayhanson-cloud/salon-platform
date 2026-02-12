"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { getAdminBasePath, isOnTenantSubdomainClient } from "@/lib/url";

type RouteGuardProps = {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireNoSite?: boolean; // If true, redirect to dashboard if user has siteId
};

export function RouteGuard({
  children,
  requireAuth = true,
  requireNoSite = false, // Wizard: only allow if user has no siteId
}: RouteGuardProps) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      if (loading) return;

      // Check authentication
      if (requireAuth && !user) {
        router.push("/login");
        return;
      }

      // If wizard route, check that user has no siteId
      if (requireNoSite && user) {
        if (user.siteId) {
          const path = getAdminBasePath(user.siteId, isOnTenantSubdomainClient());
          if (process.env.NODE_ENV === "development") {
            console.log(`[RouteGuard] uid=${user.id}, siteId=${user.siteId} -> redirecting to`, path);
          }
          router.replace(path);
          return;
        }
      }

      setChecking(false);
    };

    checkAccess();
  }, [user, loading, requireAuth, requireNoSite, router]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">בודק הרשאות...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
