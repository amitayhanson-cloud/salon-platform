"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SiteListItem {
  siteId: string;
  salonName: string;
  city?: string;
  createdAt?: string;
}

export default function PlatformAdminPage() {
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem("siteList");
      if (raw) {
        const parsed = JSON.parse(raw) as SiteListItem[];
        setSites(parsed);
      } else {
        setSites([]);
      }
    } catch (e) {
      console.error("Failed to load siteList", e);
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
          <Link
            href="/"
            className="text-xs text-sky-700 hover:text-sky-800"
          >
            חזרה לדף הבית
          </Link>
        </header>

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
    </div>
  );
}
