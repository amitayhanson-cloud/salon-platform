"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { bookingWaitlistEntriesCollection } from "@/lib/firestorePaths";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import CalenoLoading from "@/components/CalenoLoading";

type Row = {
  id: string;
  customerName: string;
  customerPhoneE164: string;
  serviceName: string;
  preferredDateYmd?: string | null;
  queuePositionForDay?: number | null;
};

function formatRequestedDate(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd.trim())) return "ללא";
  const [y, m, d] = ymd.trim().split("-").map(Number);
  if (!y || !m || !d) return "ללא";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export default function BookingWaitlistAdminPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const adminBasePath = getAdminBasePathFromSiteId(siteId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId || !db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(bookingWaitlistEntriesCollection(siteId), orderBy("createdAt", "desc"), limit(300));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              customerName: String(x.customerName ?? ""),
              customerPhoneE164: String(x.customerPhoneE164 ?? ""),
              serviceName: String(x.serviceName ?? ""),
              preferredDateYmd: (x.preferredDateYmd as string) || null,
              queuePositionForDay:
                typeof x.queuePositionForDay === "number" && Number.isFinite(x.queuePositionForDay)
                  ? x.queuePositionForDay
                  : null,
            };
          })
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("[waitlist-admin]", err);
        setError("לא ניתן לטעון את הרשימה");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [siteId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.preferredDateYmd?.trim() || "_no_pref";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "_no_pref") return 1;
        if (b === "_no_pref") return -1;
        return b.localeCompare(a);
      })
      .map(([k, list]) => {
        const sorted = [...list].sort((a, b) => {
          const qa = a.queuePositionForDay ?? 1e9;
          const qb = b.queuePositionForDay ?? 1e9;
          if (qa !== qb) return qa - qb;
          return a.id.localeCompare(b.id);
        });
        return [k, sorted] as [string, Row[]];
      });
  }, [rows]);

  if (!siteId) return null;

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" dir="rtl">
        <CalenoLoading />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8" dir="rtl">
      <AdminPageHero
        title="רשימת המתנה"
        subtitle="לקוחות שנרשמו מדף ההזמנה. כשיתבטל תור מתאים, נשלחת הודעת וואטסאפ עם אפשרות לאשר."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`${adminBasePath}/bookings`}
          className="text-sm text-caleno-700 hover:underline"
        >
          ← חזרה ליומן
        </Link>
      </div>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}
      <AdminCard className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-sm">אין רשומות ברשימת המתנה</p>
        ) : (
          grouped.map(([dateKey, list]) => (
            <div key={dateKey} className="border-b border-slate-100 last:border-b-0">
              <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
                {dateKey === "_no_pref" ? "ללא תאריך מועדף" : `תאריך מועדף: ${dateKey}`}
                <span className="font-normal text-slate-500 mr-2">({list.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="px-4 py-2 w-14">#</th>
                      <th className="px-4 py-2">שם</th>
                      <th className="px-4 py-2">טלפון</th>
                      <th className="px-4 py-2">שירות</th>
                      <th className="px-4 py-2">תאריך שביקש</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-2 tabular-nums text-slate-500">
                          {r.queuePositionForDay != null ? r.queuePositionForDay : "—"}
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-900">{r.customerName || "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs" dir="ltr">
                          {r.customerPhoneE164 || "—"}
                        </td>
                        <td className="px-4 py-2">{r.serviceName || "—"}</td>
                        <td className="px-4 py-2 tabular-nums text-slate-700">
                          {formatRequestedDate(r.preferredDateYmd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </AdminCard>
    </div>
  );
}
