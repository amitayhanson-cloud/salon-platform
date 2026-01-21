"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

type ProtectedRouteProps = {
  children: React.ReactNode;
  requireWebsite?: boolean; // If true, user must have a website
};

export function ProtectedRoute({ children, requireWebsite = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not logged in, redirect to login
        router.push("/login");
      } else if (requireWebsite && !user.siteId) {
        // User doesn't have a site yet
        router.push("/builder");
      }
    }
  }, [user, loading, requireWebsite, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">טוען...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (!user || (requireWebsite && !user.siteId)) {
    return null;
  }

  return <>{children}</>;
}
