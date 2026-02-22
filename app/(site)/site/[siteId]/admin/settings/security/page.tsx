"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ChangePasswordCard from "@/components/security/ChangePasswordCard";
import { getAdminBasePathFromSiteId } from "@/lib/url";

export default function SecuritySettingsPage() {
  const params = useParams();
  const siteId = (params?.siteId as string) ?? null;
  const { firebaseUser, loading: authLoading } = useAuth();
  const basePath = getAdminBasePathFromSiteId(siteId);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const logSecurityEvent = async (type: string, tenantId?: string) => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      await fetch("/api/security-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, tenantId: tenantId ?? siteId ?? undefined }),
      });
    } catch {
      // Non-blocking; audit log failure should not affect UX
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-xl">
      <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
        <Link href={basePath + "/settings"} className="text-caleno-600 hover:text-caleno-700 hover:underline">
          ← חזרה להגדרות
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">אבטחה</h1>
      <p className="text-sm text-slate-500 mb-6">
        שנה את הסיסמה של החשבון שלך.
      </p>

      <ChangePasswordCard
        firebaseUser={firebaseUser}
        onToast={(msg, isError) => setToast({ message: msg, isError })}
        logSecurityEvent={logSecurityEvent}
        tenantId={siteId ?? undefined}
      />

      {toast && (
        <div
          role="alert"
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm ${
            toast.isError ? "bg-red-600 text-white" : "bg-slate-800 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
