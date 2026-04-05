"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { bookingWaitlistEntriesCollection } from "@/lib/firestorePaths";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { parseDateParamToDayKey } from "@/lib/dateLocal";
import { fromYYYYMMDD } from "@/lib/calendarUtils";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import CalenoLoading from "@/components/CalenoLoading";
import { formatTimePreferenceLabelsHe } from "@/lib/bookingWaitlist/timeBuckets";
import { WaitlistEntryDeleteButton } from "@/components/admin/WaitlistEntryDeleteButton";

type Row = {
  id: string;
  customerName: string;
  customerPhoneE164: string;
  serviceName: string;
  preferredDateYmd?: string | null;
  queuePositionForDay?: number | null;
  timePreferenceLabel: string;
};

function formatRequestedDate(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd.trim())) return "ללא";
  const [y, m, d] = ymd.trim().split("-").map(Number);
  if (!y || !m || !d) return "ללא";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export default function DayBookingWaitlistPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const dateParam = params?.date as string;
  const adminBasePath = getAdminBasePathFromSiteId(siteId);
  const dateKey = parseDateParamToDayKey(dateParam);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId || !db || !dateKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      bookingWaitlistEntriesCollection(siteId),
      where("preferredDateYmd", "==", dateKey),
      orderBy("createdAt", "asc"),
      limit(100)
    );
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
              timePreferenceLabel: formatTimePreferenceLabelsHe(x.timePreference),
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        console.error("[day-waitlist]", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [siteId, dateKey]);

  const titleDate = useMemo(() => {
    const d = fromYYYYMMDD(dateKey);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
  }, [dateKey]);

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
        title={`רשימת המתנה — ${titleDate}`}
        subtitle="רק רשומות עם אותו תאריך מועדף כמו היום שנבחר ביומן. רשומות ישנות נמחקות אוטומטית אחרי שעבר תאריך המועדף (לילה, לפי אזור הזמן של העסק)."
      />
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link href={`${adminBasePath}/bookings/day/${dateKey}`} className="text-caleno-700 hover:underline">
          ← חזרה ליום
        </Link>
        <Link href={`${adminBasePath}/bookings/waitlist`} className="text-slate-600 hover:underline">
          כל הרשימה
        </Link>
      </div>
      <AdminCard className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-sm">
            אין רשומות לתאריך מועדף זה
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-2 w-14">#</th>
                  <th className="px-4 py-2">שם</th>
                  <th className="px-4 py-2">טלפון</th>
                  <th className="px-4 py-2">שירות</th>
                  <th className="px-4 py-2 whitespace-nowrap">העדפת שעה</th>
                  <th className="px-4 py-2">תאריך שביקש</th>
                  <th className="px-2 py-2 w-12 text-center"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 tabular-nums text-slate-500">
                      {r.queuePositionForDay != null ? r.queuePositionForDay : "—"}
                    </td>
                    <td className="px-4 py-2 font-medium">{r.customerName || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs" dir="ltr">
                      {r.customerPhoneE164 || "—"}
                    </td>
                    <td className="px-4 py-2">{r.serviceName || "—"}</td>
                    <td className="px-4 py-2 text-slate-700">{r.timePreferenceLabel}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-700">
                      {formatRequestedDate(r.preferredDateYmd)}
                    </td>
                    <td className="px-2 py-2 text-center align-middle">
                      <WaitlistEntryDeleteButton siteId={siteId} entryId={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
