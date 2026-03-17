"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { query, orderBy, onSnapshot, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  workersCollection,
  bookingDoc,
  clientArchivedServiceTypeDoc,
} from "@/lib/firestorePaths";
import {
  fetchCancelledArchivedBookings,
  type CancelledArchiveItem,
} from "@/lib/fetchCancelledArchivedBookings";
import { fromYYYYMMDD } from "@/lib/calendarUtils";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { ymdLocal } from "@/lib/dateLocal";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";

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
  const [confirmDelete, setConfirmDelete] = useState<CancelledArchiveItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
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

  const getStatusLabel = (status: unknown): string => {
    const s = String(status ?? "").toLowerCase();
    if (s === "cancelled" || s === "canceled") return "בוטל";
    if (s === "cancelled_by_salon") return "בוטל ע״י העסק";
    if (s === "no_show") return "לא הגיע";
    if (s) return String(status);
    return "—";
  };

  const itemKey = (b: CancelledArchiveItem) => `${b.source}-${b.id}`;
  const isDeleting = (b: CancelledArchiveItem) => deletingId === itemKey(b);

  const handleDeleteClick = (b: CancelledArchiveItem) => {
    setDeleteError(null);
    setConfirmDelete(b);
  };

  const handleConfirmDelete = async () => {
    const b = confirmDelete;
    if (!b || !siteId) return;
    const key = itemKey(b);
    setDeletingId(key);
    setDeleteError(null);
    try {
      if (b.source === "bookings") {
        await deleteDoc(bookingDoc(siteId, b.id));
      } else if (b.source === "archivedServiceTypes" && b.clientId) {
        await deleteDoc(clientArchivedServiceTypeDoc(siteId, b.clientId, b.id));
      } else {
        setDeleteError("לא ניתן למחוק — חסר מזהה ארכיון.");
        setDeletingId(null);
        return;
      }
      setArchiveBookings((prev) => prev.filter((x) => itemKey(x) !== key));
      setConfirmDelete(null);
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 3000);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "שגיאה במחיקה");
    } finally {
      setDeletingId(null);
    }
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
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <AdminPageHero
            title="תורים שבוטלו"
            subtitle="רשימת תורים שבוטלו או לא הגיעו"
            className="flex-1"
          />
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {deleteError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-right">
            <p className="text-sm text-red-700">{deleteError}</p>
          </div>
        )}
        {deleteSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-right">
            <p className="text-sm text-green-700">התור המבוטל נמחק בהצלחה.</p>
          </div>
        )}
        {DEBUG && debugInfo && (
          <div className="mb-4 p-3 bg-slate-100 border border-slate-200 rounded-xl text-right text-xs font-mono">
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

        <AdminCard className="overflow-hidden">
          <div className="flex justify-start border-b border-slate-200 bg-slate-50/50 px-4 py-3">
            <Link
              href={`${adminBasePath}/bookings/day/${dateKey}`}
              className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-slate-50 shrink-0"
            >
              ← חזרה ללוח זמנים
            </Link>
          </div>
          {archiveBookings.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 text-sm">אין תורים שבוטלו</p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="block md:hidden p-3 space-y-3">
                {archiveBookings.map((b) => (
                  <div
                    key={itemKey(b)}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-right flex flex-col gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 break-words">
                        {b.customerName || "—"}
                        {b.serviceName ? ` — ${b.serviceName}` : ""}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        {formatDateColumn(b.date)}
                        {b.time ? ` · ${b.time} – ${getEndTime(b)}` : ""}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5 break-all">
                        {b.customerPhone || b.phone || "—"}
                      </p>
                      {(getStatusLabel(b.status) !== "—" || (b.cancellationReason && b.cancellationReason.trim())) && (
                        <p className="text-xs text-slate-500 mt-1.5 break-words">
                          {getStatusLabel(b.status) !== "—" && getStatusLabel(b.status)}
                          {getStatusLabel(b.status) !== "—" && b.cancellationReason?.trim() ? " · " : ""}
                          {b.cancellationReason?.trim() || ""}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-start">
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(b)}
                        disabled={isDeleting(b)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                        aria-label="מחק תור מבוטל"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        מחק
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
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
                      <th className="px-4 py-3 text-right font-semibold text-slate-700 w-20" scope="col">מחיקה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archiveBookings.map((b) => (
                      <tr key={itemKey(b)} className="border-b border-slate-100 hover:bg-slate-50">
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
                        <td className="px-4 py-3 text-slate-600">
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(b)}
                            disabled={isDeleting(b)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                            aria-label="מחק תור מבוטל"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </AdminCard>
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-xl">
            <h2 id="confirm-delete-title" className="text-lg font-bold text-slate-900 text-right">
              מחיקת תור מבוטל
            </h2>
            <p className="mt-2 text-sm text-slate-600 text-right">
              האם למחוק את התור המבוטל הזה?
            </p>
            <div className="mt-6 flex gap-3 justify-start">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(null);
                  setDeleteError(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!!deletingId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId ? "מוחק…" : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
