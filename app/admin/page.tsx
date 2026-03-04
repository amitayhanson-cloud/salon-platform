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
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean | null>(null);
  const [whatsappSaving, setWhatsappSaving] = useState(false);

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
        const headers = { Authorization: `Bearer ${token}` };
        const [sitesRes, settingsRes] = await Promise.all([
          fetch("/api/admin/sites", { headers }),
          fetch("/api/admin/platform-settings", { headers }),
        ]);
        const data = await sitesRes.json().catch(() => ({}));
        if (cancelled) return;
        if (sitesRes.ok && Array.isArray(data?.sites)) {
          setSites(data.sites);
        } else {
          setSites([]);
        }
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json().catch(() => ({}));
          setWhatsappEnabled(typeof settingsData.whatsappAutomationsEnabled === "boolean" ? settingsData.whatsappAutomationsEnabled : true);
        } else {
          setWhatsappEnabled(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load admin data", e);
          setSites([]);
          setWhatsappEnabled(true);
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

        {/* WhatsApp Automations kill-switch */}
        <div className="mb-8 max-w-xl">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">WhatsApp Automations</h2>
            <p className="text-xs text-slate-500 mb-4">
              When disabled, no WhatsApp automations will be sent from any site.
            </p>
            <p className="text-xs text-amber-700 mb-3">
              כשההגדרה כבויה, לא יישלחו הודעות WhatsApp אוטומטיות מאף אתר.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={whatsappEnabled === true}
                disabled={whatsappEnabled === null || whatsappSaving}
                onClick={async () => {
                  if (whatsappEnabled === null || whatsappSaving) return;
                  const next = !whatsappEnabled;
                  setWhatsappSaving(true);
                  try {
                    const fbUser = firebaseUserRef.current;
                    if (!fbUser) {
                      setToast({ message: "לא מחובר", isError: true });
                      return;
                    }
                    const token = await fbUser.getIdToken();
                    const res = await fetch("/api/admin/platform-settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ whatsappAutomationsEnabled: next }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data.ok) {
                      setWhatsappEnabled(next);
                      setToast({ message: next ? "אוטומציות WhatsApp פעילות" : "אוטומציות WhatsApp כבויות" });
                    } else {
                      setToast({ message: data?.message || data?.error || "שגיאה בשמירה", isError: true });
                    }
                  } catch (e) {
                    setToast({ message: "שגיאה בשמירה", isError: true });
                  } finally {
                    setWhatsappSaving(false);
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  whatsappEnabled ? "bg-sky-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    whatsappEnabled ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-slate-700">
                {whatsappEnabled === null ? "טוען…" : whatsappSaving ? "שומר…" : whatsappEnabled ? "פעיל" : "כבוי"}
              </span>
            </div>
          </div>
        </div>

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
