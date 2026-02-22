"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import CleanupCard from "@/components/admin/CleanupCard";

interface SiteListItem {
  siteId: string;
  salonName: string;
  city?: string;
  createdAt?: string;
}

export default function PlatformAdminPage() {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const firebaseUserRef = useRef(firebaseUser);
  firebaseUserRef.current = firebaseUser;
  const router = useRouter();
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const fbUser = firebaseUserRef.current;
    if (!isPlatformAdmin(user.email) || !fbUser) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await fbUser.getIdToken();
        const res = await fetch("/api/admin/sites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && Array.isArray(data?.sites)) {
          setSites(data.sites);
        } else {
          setSites([]);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load sites", e);
          setSites([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-sm text-slate-500">טוען…</p>
      </div>
    );
  }

  if (!isPlatformAdmin(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center text-slate-700">
          <p className="font-semibold">אין הרשאה</p>
          <p className="text-sm mt-2">אין לך גישה לפאנל ניהול הפלטפורמה.</p>
          <Link href="/" className="text-[#2EC4C6] hover:underline mt-4 inline-block">
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">טוען נתונים…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-right">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              פאנל ניהול פלטפורמה
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              כאן אפשר לראות את כל האתרים שנוצרו במערכת.
            </p>
          </div>
          <div className="flex items-center gap-3">
          <Link
            href="/admin/landing"
            className="text-xs text-sky-700 hover:text-sky-800"
          >
            עריכת דף נחיתה
          </Link>
          <Link
            href="/"
            className="text-xs text-sky-700 hover:text-sky-800"
          >
            חזרה לדף הבית
          </Link>
        </div>
        </header>

        {sites.length > 0 && (
          <div className="mb-8 max-w-xl">
            <label htmlFor="cleanup-site" className="block text-sm font-semibold text-slate-900 mb-2">
              ניקוי תורים – בחר אתר
            </label>
            <select
              id="cleanup-site"
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="mb-3 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">בחר אתר</option>
              {sites.map((s) => (
                <option key={s.siteId} value={s.siteId}>
                  {s.salonName || s.siteId}
                </option>
              ))}
            </select>
            {selectedSiteId && (
              <CleanupCard
                siteId={selectedSiteId}
                onToast={(msg, isError) => setToast({ message: msg, isError })}
                onComplete={() => router.refresh()}
              />
            )}
          </div>
        )}

        {sites.length === 0 ? (
          <p className="text-sm text-slate-600">
            עדיין אין אתרים שנוצרו על ידי משתמשים.
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="py-2 px-2 text-right">שם הסלון</th>
                  <th className="py-2 px-2 text-right">עיר</th>
                  <th className="py-2 px-2 text-right">תאריך יצירה</th>
                  <th className="py-2 px-2 text-right">קישורים</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr
                    key={site.siteId}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-2 px-2">{site.salonName}</td>
                    <td className="py-2 px-2">{site.city || "-"}</td>
                    <td className="py-2 px-2">
                      {site.createdAt
                        ? new Date(site.createdAt).toLocaleString("he-IL")
                        : "-"}
                    </td>
                    <td className="py-2 px-2 space-x-2 space-x-reverse">
                      <Link
                        href={`/site/${site.siteId}`}
                        className="text-xs text-sky-700 hover:underline"
                      >
                        צפייה באתר
                      </Link>
                      <Link
                        href={`/site/${site.siteId}/admin`}
                        className="text-xs text-slate-700 hover:underline"
                      >
                        ניהול אתר
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
