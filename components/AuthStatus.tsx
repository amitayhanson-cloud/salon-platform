"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminPanelLink } from "@/components/AdminPanelLink";

/**
 * Auth-aware block for the marketing header (root domain).
 * - Loading: skeleton
 * - Authenticated: "מחובר/ת כ- {name}" + "לפאנל ניהול" + "התנתקות" / "החלף משתמש"
 * - Anonymous: "לפאנל ניהול" (→ /login?returnTo=admin) + "הרשמה"
 */
export function AuthStatus({ minimal = false }: { minimal?: boolean }) {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, logout } = useAuth();

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

    const userControls = (
      <div className="flex items-center gap-3 md:gap-4 flex-wrap">
        <span className="text-slate-700 font-medium text-sm">
          מחובר/ת כ־{displayName}
        </span>
        <div className="flex items-center gap-2">
          <AdminPanelLink className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-sm font-medium transition-colors inline-block">
            לפאנל ניהול
          </AdminPanelLink>
          {!minimal && (
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="text-sm text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              החלף משתמש
            </button>
          )}
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

    return userControls;
  }

  return (
    <div className="flex items-center gap-4 md:gap-6 flex-wrap">
      <AdminPanelLink className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors">
        לפאנל ניהול
      </AdminPanelLink>
      <Link
        href="/signup"
        className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-lg font-medium transition-colors"
      >
        הרשמה
      </Link>
    </div>
  );
}
