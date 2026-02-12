"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

type TenantMe = { slug: string | null; publicUrl: string | null; siteId: string | null };

export default function AccountPage() {
  const router = useRouter();
  const { user, firebaseUser, logout, loading } = useAuth();
  const [tenantMe, setTenantMe] = useState<TenantMe | null>(null);
  const [tenantMeLoading, setTenantMeLoading] = useState(true);
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantBusy, setTenantBusy] = useState(false);
  const [tenantMessage, setTenantMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fetchTenantMe = useCallback(async () => {
    if (!firebaseUser) {
      setTenantMeLoading(false);
      return;
    }
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/tenants/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as TenantMe;
        setTenantMe(data);
      } else {
        setTenantMe({ slug: null, publicUrl: null, siteId: null });
      }
    } catch {
      setTenantMe({ slug: null, publicUrl: null, siteId: null });
    } finally {
      setTenantMeLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (firebaseUser && user) fetchTenantMe();
  }, [firebaseUser, user, fetchTenantMe]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleCreateOrChangeTenant = async () => {
    setTenantMessage(null);
    const slug = tenantSlug.trim().toLowerCase();
    if (!slug) {
      setTenantMessage({ type: "err", text: "נא להזין תת-דומיין (3–30 תווים, a-z 0-9 מקף)." });
      return;
    }
    if (!firebaseUser) {
      setTenantMessage({ type: "err", text: "יש להתחבר." });
      return;
    }
    setTenantBusy(true);
    try {
      const token = await firebaseUser.getIdToken();
      const isChange = tenantMe?.slug != null;
      const url = isChange ? "/api/tenants/change" : "/api/tenants/create";
      const body = isChange ? { newSlug: slug } : { slug };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; publicUrl?: string } & TenantMe;
      if (res.ok && data.success) {
        setTenantMessage({
          type: "ok",
          text: data.publicUrl ? `כתובת האתר: ${data.publicUrl}` : (data.slug ? `${data.slug}.caleno.co` : "עודכן."),
        });
        setTenantSlug("");
        fetchTenantMe();
      } else {
        setTenantMessage({ type: "err", text: (data.error as string) || "שגיאה." });
      }
    } catch {
      setTenantMessage({ type: "err", text: "שגיאת רשת." });
    } finally {
      setTenantBusy(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">טוען...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 sm:p-8 text-right">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">
            חשבון המשתמש
          </h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                שלום, {user.name || user.email}
              </h2>
              <p className="text-slate-600">{user.email}</p>
            </div>

            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                אזור החשבון
              </h3>
              <p className="text-slate-600 text-sm mb-4">
                כאן תוכלו לראות את האתרים שיצרתם, הגדרות, חשבוניות ועוד.
                <br />
                (תכונות נוספות יגיעו בהמשך)
              </p>
            </div>

            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                תת-דומיין (Caleno)
              </h3>
              {tenantMeLoading ? (
                <p className="text-slate-500 text-sm">טוען...</p>
              ) : tenantMe?.publicUrl ? (
                <p className="text-slate-600 text-sm mb-3">
                  הכתובת הנוכחית:{" "}
                  <a
                    href={tenantMe.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline"
                    dir="ltr"
                  >
                    {tenantMe.publicUrl}
                  </a>
                </p>
              ) : tenantMe?.siteId ? (
                <p className="text-slate-600 text-sm mb-3">אין עדיין תת-דומיין. צרו אחד למטה.</p>
              ) : null}
              <p className="text-slate-600 text-sm mb-3">
                {tenantMe?.slug ? "החלפת תת-דומיין:" : "צרו תת-דומיין (למשל "}
                {!tenantMe?.slug && <code className="bg-slate-100 px-1 rounded">alice</code>}
                {!tenantMe?.slug && " → alice.caleno.co). "}
                3–30 תווים, אותיות באנגלית, ספרות ומקף.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder={tenantMe?.slug ?? "alice"}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleCreateOrChangeTenant}
                  disabled={tenantBusy}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm"
                >
                  {tenantBusy ? "..." : tenantMe?.slug ? "החלף תת-דומיין" : "צור תת-דומיין"}
                </button>
              </div>
              {tenantMessage && (
                <p className={`mt-2 text-sm ${tenantMessage.type === "ok" ? "text-green-600" : "text-red-600"}`}>
                  {tenantMessage.text}
                </p>
              )}
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={handleLogout}
                className="px-6 py-3 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium transition-colors"
              >
                התנתקות
              </button>
              <Link
                href="/"
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors"
              >
                חזרה לדף הבית
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

