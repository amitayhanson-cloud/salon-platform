"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { useTenantInfo } from "@/hooks/useTenantInfo";

/**
 * Thin banner below the header, only when authenticated.
 * "מחובר/ת כ- {name}" + "תת-דומיין: {slug}"
 */
export function ConnectedBanner() {
  const { user, firebaseUser, loading } = useAuth();
  const { data: tenantInfo } = useTenantInfo();

  if (loading || !firebaseUser || !user) return null;

  const displayName =
    user.name?.trim() ||
    firebaseUser.displayName?.trim() ||
    user.email ||
    firebaseUser.email ||
    "משתמש";
  const slug = tenantInfo?.slug ?? user.primarySlug ?? null;

  return (
    <div
      className="bg-[#EEF7F9] border-b border-[#E2EEF2] py-1.5 px-4"
      dir="rtl"
    >
      <div className="container mx-auto flex items-center justify-end gap-4 text-sm text-slate-600">
        <span>מחובר/ת כ־{displayName}</span>
        {slug && <span>תת־דומיין: {slug}</span>}
      </div>
    </div>
  );
}
