"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTenantInfo } from "@/hooks/useTenantInfo";
import { getDashboardUrl } from "@/lib/url";

/**
 * Auth-aware block for the marketing header (root domain).
 * - Loading: skeleton
 * - Authenticated: "מחובר/ת כ- {name}" + subdomain + "לדשבורד" + "התנתקות" / "החלף משתמש"
 * - Anonymous: "התחברות" (Connect) + "הרשמה"
 * Connect when already logged in does NOT go to login; it shows connected state and "Go to dashboard".
 */
export function AuthStatus() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, logout } = useAuth();
  const { data: tenantInfo, loading: tenantLoading } = useTenantInfo();

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const handleSwitchAccount = async () => {
    await logout();
    router.push("/login");
  };

  if (authLoading) {
    return (
      <div className="flex items-center gap-4 md:gap-6">
        <div className="h-6 w-20 bg-slate-200 rounded animate-pulse" />
        <div className="h-9 w-24 bg-slate-200 rounded animate-pulse" />
      </div>
    );
  }

  if (firebaseUser && user) {
    const displayName =
      user.name?.trim() ||
      firebaseUser.displayName?.trim() ||
      user.email ||
      firebaseUser.email ||
      "משתמש";
    const slug = tenantInfo?.slug ?? user.primarySlug ?? null;
    const dashboardUrl =
      tenantInfo?.dashboardUrl ??
      (user.siteId
        ? getDashboardUrl({ slug, siteId: user.siteId })
        : "/dashboard");

    const isFullUrl = dashboardUrl.startsWith("http");
    const goToDashboard = () => {
      if (isFullUrl) {
        window.location.href = dashboardUrl;
      } else {
        router.push(dashboardUrl);
      }
    };

    return (
      <div className="flex items-center gap-3 md:gap-4 flex-wrap">
        <div className="flex flex-col items-end text-sm">
          <span className="text-slate-700 font-medium">
            מחובר/ת כ־{displayName}
          </span>
          {slug && (
            <span className="text-slate-500 text-xs">תת־דומיין: {slug}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToDashboard}
            className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-sm font-medium transition-colors"
          >
            {tenantLoading ? "..." : "לדשבורד"}
          </button>
          <button
            type="button"
            onClick={handleSwitchAccount}
            className="text-sm text-[#475569] hover:text-[#0F172A] transition-colors"
          >
            החלף משתמש
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-[#475569] hover:text-[#0F172A] transition-colors"
          >
            התנתקות
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 md:gap-6 flex-wrap">
      <Link
        href="/dashboard"
        className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
      >
        התחברות
      </Link>
      <Link
        href="/signup"
        className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-lg font-medium transition-colors"
      >
        הרשמה
      </Link>
    </div>
  );
}
