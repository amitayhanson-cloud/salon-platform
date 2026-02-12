"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { getDashboardUrl } from "@/lib/url";
import { routeAfterAuth } from "@/lib/authRedirect";

/**
 * Dashboard entry: used by marketing header "התחברות".
 * Always computes redirect from CURRENT user's uid via GET /api/dashboard-redirect (no caching).
 * - Logged out → redirect to /login
 * - Logged in → GET /api/dashboard-redirect with Bearer token → redirect to that url
 */
export default function DashboardPage() {
  const { user, firebaseUser, authReady, loading } = useAuth();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (!authReady || loading) return;
    if (didRedirect.current) return;

    if (!firebaseUser || !user) {
      didRedirect.current = true;
      router.replace("/login");
      return;
    }

    const go = async () => {
      try {
        const token = await firebaseUser.getIdToken(true);
        const res = await fetch("/api/dashboard-redirect", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.status === 401) {
          didRedirect.current = true;
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          if (data?.url) {
            didRedirect.current = true;
            window.location.href = data.url;
            return;
          }
        }
      } catch {
        // fallback below
      }
      const result = await routeAfterAuth(user.id);
      const url = result.siteId
        ? getDashboardUrl({ slug: result.slug, siteId: result.siteId })
        : result.path;
      didRedirect.current = true;
      if (url.startsWith("http")) {
        window.location.href = url;
      } else {
        router.replace(url);
      }
    };

    go();
  }, [authReady, loading, firebaseUser, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4" />
        <p className="text-slate-600">מעביר לדשבורד...</p>
      </div>
    </div>
  );
}
