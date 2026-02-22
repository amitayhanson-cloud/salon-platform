"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { workersCollection } from "@/lib/firestorePaths";
import {
  fetchCancelledArchivedBookings,
  type CancelledArchiveItem,
} from "@/lib/fetchCancelledArchivedBookings";
import { fromYYYYMMDD } from "@/lib/calendarUtils";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { ymdLocal } from "@/lib/dateLocal";

const DEBUG = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEBUG_BOOKING === "true";

export default function CancelledBookingsPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const dateParam = params?.date as string;
  const adminBasePath = getAdminBasePathFromSiteId(siteId);

  const dateKey = useMemo(() => {
    const d = dateParam ? fromYYYYMMDD(dateParam) : new Date();
    return ymdLocal(d);
  }, [dateParam]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveBookings, setArchiveBookings] = useState<CancelledArchiveItem[]>([]);
  const [workers, setWorkers] = useState<Array<{ id: string; name: string }>>([]);
  const [debugInfo, setDebugInfo] = useState<{
    bookingsScanned: number;
    archivedScanned: number;
    cancelledFromBookings: number;
    cancelledFromArchived: number;
    totalCancelled: number;
    firstDate: string | null;
    lastDate: string | null;
  } | null>(null);

  const workerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w) => map.set(w.id, w.name));
    return map;
  }, [workers]);

  useEffect(() => {
    if (!siteId || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchCancelledArchivedBookings(siteId, { debug: DEBUG })
      .then((result) => {
        setArchiveBookings(result.items);
        if (result.debug) setDebugInfo(result.debug);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "שגיאה בטעינת התורים");
        setArchiveBookings([]);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !db) return;
    const q = query(workersCollection(siteId), orderBy("name", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setWorkers(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || "" })));
      },
      (err) => console.error("[CancelledBookings] workers error", err)
    );
    return () => unsub();
  }, [siteId]);

  const formatDateColumn = (ymd: string): string => {
    if (!ymd) return "—";
    const d = fromYYYYMMDD(ymd);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
  };

  const getEndTime = (b: CancelledArchiveItem): string => {
    if (!b.time) return "—";
    const [h, m] = b.time.split(":").map(Number);
    const start = new Date(2000, 0, 1, h, m, 0);
    const end = new Date(start.getTime() + (b.durationMin || 60) * 60 * 1000);
    return `${end.getHours().toString().padStart(2, "0")}:${end.getMinutes().toString().padStart(2, "0")}`;
  };

  const getWorkerName = (b: CancelledArchiveItem): string => {
    if (b.workerId && workerNameMap.has(b.workerId)) return workerNameMap.get(b.workerId)!;
    return b.workerName || "—";
  };

  const getStatusLabel = (status: string): string => {
    const s = (status || "").toLowerCase();
    if (s === "cancelled" || s === "canceled") return "בוטל";
    if (s === "cancelled_by_salon") return "בוטל ע״י העסק";
    if (s === "no_show") return "לא הגיע";
    return status || "—";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-slate-600 text-sm">טוען…</p>
      </div>
    );
  }

  if (!siteId) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-right">
          <p className="text-red-700 font-semibold">siteId חסר. אנא רענן את הדף.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h1 className="text-2xl font-bold text-slate-900">תורים שבוטלו</h1>
            <Link
              href={`${adminBasePath}/bookings/day/${dateKey}`}
              className="text-sm text-caleno-700 hover:underline"
            >
              ← חזרה ללוח זמנים
            </Link>
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {DEBUG && debugInfo && (
            <div className="mb-4 p-3 bg-slate-100 border border-slate-200 rounded-lg text-right text-xs font-mono">
              <span>נסרקו: {debugInfo.bookingsScanned} bookings, {debugInfo.archivedScanned} archived</span>
              {" · "}
              <span>בוטלו: {debugInfo.cancelledFromBookings} מ-bookings, {debugInfo.cancelledFromArchived} מארכיון</span>
              {" · "}
              <span>סה״כ: {debugInfo.totalCancelled}</span>
              {debugInfo.firstDate && debugInfo.lastDate && (
                <>
                  {" · "}
                  <span>טווח: {debugInfo.firstDate} – {debugInfo.lastDate}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {archiveBookings.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 text-sm">אין תורים שבוטלו</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">תאריך</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">שעה</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">לקוח</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">טלפון</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">שירות</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">מטפל</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">סטטוס</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">סיבת ביטול</th>
                  </tr>
                </thead>
                <tbody>
                  {archiveBookings.map((b) => (
                    <tr key={`${b.source}-${b.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{formatDateColumn(b.date)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {b.time ? `${b.time} – ${getEndTime(b)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{b.customerName || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{b.customerPhone || b.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{b.serviceName || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{getWorkerName(b)}</td>
                      <td className="px-4 py-3 text-slate-600">{getStatusLabel(b.status)}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                        {b.cancellationReason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
