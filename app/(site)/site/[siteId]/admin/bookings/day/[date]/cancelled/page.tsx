"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  query,
  orderBy,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  bookingsCollection,
  workersCollection,
  bookingDoc,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { fromYYYYMMDD } from "@/lib/calendarUtils";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { bookingEnabled } from "@/lib/bookingEnabled";
import type { SiteConfig } from "@/types/siteConfig";
import { useAuth } from "@/hooks/useAuth";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { X, Pencil, Trash2 } from "lucide-react";

const DAY_LABELS: Record<string, string> = {
  "0": "ראשון",
  "1": "שני",
  "2": "שלישי",
  "3": "רביעי",
  "4": "חמישי",
  "5": "שישי",
  "6": "שבת",
};

// Cancelled booking statuses - stable constant array (never changes)
const CANCELLED_STATUSES = ["cancelled", "canceled", "cancelled_by_salon", "no_show"];

interface ArchiveBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  phone?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMin: number;
  workerId: string | null;
  workerName?: string;
  note?: string;
  cancellationReason?: string | null;
  status: string;
  createdAt: string;
}

type Scope = "day" | "all";

export default function CancelledBookingsPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const siteId = params?.siteId as string;
  const adminBasePath = getAdminBasePathFromSiteId(siteId);
  const dateParam = params?.date as string;

  // Scope: "day" (default) = by day; "all" = all
  const scope: Scope = searchParams?.get("scope") === "all" ? "all" : "day";

  const setScope = useCallback(
    (newScope: Scope) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("scope", newScope);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  // Parse date from URL - memoize to prevent recreation on each render
  const selectedDate = useMemo(() => {
    return dateParam ? fromYYYYMMDD(dateParam) : new Date();
  }, [dateParam]);
  
  const dateKey = useMemo(() => ymdLocal(selectedDate), [selectedDate]);

  // Note: This page shows cancelled bookings (by day or all), not filtered by worker

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [archiveBookings, setArchiveBookings] = useState<ArchiveBooking[]>([]);
  const [workers, setWorkers] = useState<Array<{ id: string; name: string }>>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  
  // Edit cancellation reason state
  const [editingReason, setEditingReason] = useState<{ bookingId: string; currentReason: string } | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [savingReason, setSavingReason] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Permanent delete state (single row)
  const [deleteConfirmBookingId, setDeleteConfirmBookingId] = useState<string | null>(null);
  const [deletingBookingId, setDeletingBookingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState<boolean>(false);

  // "מחק הכל" (delete all archived) state
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const { firebaseUser } = useAuth();

  // Clear toast after delay
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => {
      setToastMessage(null);
      setToastError(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Create worker lookup map for efficient name resolution
  const workerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((worker) => {
      map.set(worker.id, worker.name);
    });
    return map;
  }, [workers]);

  // Store latest workerNameMap in ref to avoid re-subscriptions
  const workerNameMapRef = useRef(workerNameMap);
  useEffect(() => {
    workerNameMapRef.current = workerNameMap;
  }, [workerNameMap]);

  // Load site config
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        setConfig(cfg);
      },
      (e) => {
        console.error("[CancelledBookings] Failed to load site config", e);
      }
    );

    return () => unsubscribe?.();
  }, [siteId]);

  // Load workers for name mapping
  useEffect(() => {
    if (!siteId || !db) return;

    const workersQuery = query(workersCollection(siteId), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "",
        }));
        setWorkers(items);
      },
      (err) => {
        console.error("[CancelledBookings] Failed to load workers", err);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Helper: map doc to ArchiveBooking with endTime (query already filtered by status)
  const mapDocToArchiveBooking = useCallback(
    (
      d: { id: string; data: () => Record<string, unknown> },
      dateForDay: Date
    ): (ArchiveBooking & { endTime: string }) | null => {
      const data = d.data();
      const status = (data.status as string) ?? "";
      const workerName = (data.workerId as string)
        ? workerNameMapRef.current.get(data.workerId as string)
        : undefined;
      const [hours, minutes] = ((data.time as string) || "00:00").split(":").map(Number);
      const startTime = new Date(dateForDay);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + ((data.durationMin as number) || 60) * 60 * 1000);
      const endTimeStr = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
      return {
        id: d.id,
        ...data,
        status,
        workerName,
        cancellationReason: (data.cancellationReason ?? data.cancelReason) as string | null,
        endTime: endTimeStr,
      } as ArchiveBooking & { endTime: string };
    },
    []
  );

  // Load cancelled bookings only (scope: day | all)
  useEffect(() => {
    if (!siteId || !db) {
      setBookingsLoading(false);
      setLoading(false);
      return;
    }
    if (scope === "day" && !dateKey) {
      setBookingsLoading(false);
      setLoading(false);
      return;
    }

    setBookingsLoading(true);
    setError(null);

    if (scope === "day") {
      let dayQuery;
      try {
        dayQuery = query(
          bookingsCollection(siteId),
          where("date", "==", dateKey),
          orderBy("time", "asc")
        );
      } catch {
        dayQuery = query(bookingsCollection(siteId), where("date", "==", dateKey));
      }
      const unsubscribe = onSnapshot(
        dayQuery,
        (snapshot) => {
          const items = snapshot.docs
            .map((doc) => mapDocToArchiveBooking(doc as { id: string; data: () => Record<string, unknown> }, selectedDate))
            .filter((item): item is ArchiveBooking & { endTime: string } => item !== null)
            .filter((item) => CANCELLED_STATUSES.includes((item.status || "").toLowerCase()));
          items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
          setArchiveBookings(items as ArchiveBooking[]);
          setBookingsLoading(false);
          setLoading(false);
        },
        (err) => {
          console.error("[ArchiveBookings] day cancelled failed", err);
          if (err.message?.includes("index") || err.message?.includes("orderBy")) {
            const fallback = query(bookingsCollection(siteId), where("date", "==", dateKey));
            const unsub = onSnapshot(
              fallback,
              (snap) => {
                const items = snap.docs
                  .map((doc) => mapDocToArchiveBooking(doc as { id: string; data: () => Record<string, unknown> }, selectedDate))
                  .filter((item): item is ArchiveBooking & { endTime: string } => item !== null)
                  .filter((item) => CANCELLED_STATUSES.includes((item.status || "").toLowerCase()));
                items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                setArchiveBookings(items as ArchiveBooking[]);
                setBookingsLoading(false);
                setLoading(false);
              },
              (e) => {
                setError(e.message || "שגיאה בטעינת התורים");
                setBookingsLoading(false);
                setLoading(false);
              }
            );
            return () => unsub();
          }
          setError(err.message || "שגיאה בטעינת התורים");
          setBookingsLoading(false);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    }

    const allQuery = query(
      bookingsCollection(siteId),
      where("status", "in", CANCELLED_STATUSES),
      orderBy("status"),
      orderBy("date", "desc"),
      limit(100)
    );
    const unsubscribe = onSnapshot(
      allQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            const dateStr = data.date as string;
            const dateForDay = dateStr ? fromYYYYMMDD(dateStr) : new Date();
            return mapDocToArchiveBooking({ id: doc.id, data: () => doc.data() }, dateForDay);
          })
          .filter((item): item is ArchiveBooking & { endTime: string } => item !== null);
        items.sort((a, b) => {
          const d = (b.date || "").localeCompare(a.date || "");
          if (d !== 0) return d;
          return (b.time || "").localeCompare(a.time || "");
        });
        setArchiveBookings(items as ArchiveBooking[]);
        setBookingsLoading(false);
        setLoading(false);
      },
      (err) => {
        console.error("[ArchiveBookings] all cancelled failed", err);
        setError(err.message || "שגיאה בטעינת התורים");
        setBookingsLoading(false);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [siteId, dateKey, selectedDate, scope, mapDocToArchiveBooking]);

  // Note: Worker names are now resolved directly in the bookings fetch effect
  // using workerNameMap, so no separate effect is needed

  const formatDayLabel = (date: Date): string => {
    const dayIndex = date.getDay().toString();
    return `${DAY_LABELS[dayIndex]} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  };

  // Calculate end time for display (use bookingDate when in "all" mode so each row uses its own date)
  const getEndTime = (booking: ArchiveBooking, bookingDate?: Date): string => {
    const [hours, minutes] = (booking.time || "00:00").split(":").map(Number);
    const base = bookingDate ?? selectedDate;
    const startTime = new Date(base);
    startTime.setHours(hours, minutes, 0, 0);
    const endTime = new Date(startTime.getTime() + (booking.durationMin || 60) * 60 * 1000);
    return `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
  };

  // Format YYYY-MM-DD for table column (e.g. 28/01/2025)
  const formatDateColumn = (ymd: string): string => {
    if (!ymd) return "—";
    const d = fromYYYYMMDD(ymd);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
  };

  // Get worker name using lookup map
  const getWorkerName = (booking: ArchiveBooking): string => {
    if (booking.workerId && workerNameMap.has(booking.workerId)) {
      return workerNameMap.get(booking.workerId)!;
    }
    return booking.workerName || "—";
  };

  // Handle edit cancellation reason (only for cancelled tab)
  const handleEditReason = (booking: ArchiveBooking) => {
    setEditingReason({
      bookingId: booking.id,
      currentReason: booking.cancellationReason || "",
    });
    setReasonInput(booking.cancellationReason || "");
    setReasonError(null);
  };

  // Handle save cancellation reason
  const handleSaveReason = async () => {
    if (!editingReason || !siteId || !db) return;

    // Validate: require at least 2 characters
    const trimmedReason = reasonInput.trim();
    if (trimmedReason.length > 0 && trimmedReason.length < 2) {
      setReasonError("סיבת הביטול חייבת להכיל לפחות 2 תווים");
      return;
    }

    setSavingReason(true);
    setReasonError(null);

    try {
      await updateDoc(bookingDoc(siteId, editingReason.bookingId), {
        cancellationReason: trimmedReason || null,
        updatedAt: serverTimestamp(),
      });
      
      // Update local state immediately
      setArchiveBookings((prev) =>
        prev.map((booking) =>
          booking.id === editingReason.bookingId
            ? { ...booking, cancellationReason: trimmedReason || null }
            : booking
        )
      );
      
      setEditingReason(null);
      setReasonInput("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setReasonError(msg);
    } finally {
      setSavingReason(false);
    }
  };

  // Handle cancel edit reason
  const handleCancelEditReason = () => {
    setEditingReason(null);
    setReasonInput("");
    setReasonError(null);
  };

  const isBookingCancelled = (booking: ArchiveBooking): boolean => {
    const status = (booking.status || "").toLowerCase();
    return CANCELLED_STATUSES.includes(status);
  };

  // Permanently delete a single archived booking from Firestore
  const handleDeletePermanently = async (bookingId: string) => {
    if (!siteId || !bookingId) {
      console.error("[ArchiveBookings] Cannot delete: missing siteId or bookingId", { siteId, bookingId });
      setToastMessage("שגיאה: חסר מזהה אתר או מזהה תור");
      setToastError(true);
      return;
    }

    const booking = archiveBookings.find((b) => b.id === bookingId);
    if (booking && !isBookingCancelled(booking)) {
      console.error("[ArchiveBookings] Cannot delete: booking is not cancelled", { bookingId, status: booking.status });
      setToastMessage("ניתן למחוק רק תורים שבוטלו");
      setToastError(true);
      return;
    }

    console.log("[ArchiveBookings] Deleting booking", { bookingId, siteId });
    setDeletingBookingId(bookingId);

    try {
      const ref = bookingDoc(siteId, bookingId);
      await deleteDoc(ref);
      setArchiveBookings((prev) => prev.filter((b) => b.id !== bookingId));
      setDeleteConfirmBookingId(null);
      setToastMessage("התור נמחק לצמיתות");
      setToastError(false);
    } catch (e) {
      console.error("[ArchiveBookings] Delete failed", { bookingId, siteId, error: e });
      setToastMessage(e instanceof Error ? e.message : "שגיאה במחיקת התור");
      setToastError(true);
    } finally {
      setDeletingBookingId(null);
    }
  };

  // Delete all archived (cancelled + expired) via API
  const handleDeleteAllArchived = async () => {
    if (!siteId || !firebaseUser) {
      setToastMessage("שגיאה: חסר התחברות או מזהה אתר");
      setToastError(true);
      return;
    }
    setDeletingAll(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/delete-archived-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToastMessage(data.error === "forbidden" ? "אין הרשאה" : data.error || "שגיאה במחיקה");
        setToastError(true);
        return;
      }
      setDeleteAllConfirmOpen(false);
      setArchiveBookings([]);
      setToastMessage(`נמחקו ${(data.deletedCancelled || 0) + (data.deletedExpired || 0)} תורים שבוטלו`);
      setToastError(false);
    } catch (e) {
      setToastMessage(e instanceof Error ? e.message : "שגיאה במחיקה");
      setToastError(true);
    } finally {
      setDeletingAll(false);
    }
  };

  if (loading || bookingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center">
          <p className="text-slate-600 text-sm mb-2">טוען…</p>
        </div>
      </div>
    );
  }

  if (!siteId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-right">
          <p className="text-red-700 font-semibold mb-2">שגיאה</p>
          <p className="text-sm text-red-600">siteId חסר. אנא רענן את הדף.</p>
        </div>
      </div>
    );
  }

  if (config && !bookingEnabled(config)) {
    return (
      <div className="min-h-screen bg-slate-50 py-8" dir="rtl">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 sm:p-8 text-right">
            <h1 className="text-xl font-bold text-slate-900 mb-2">
              ניהול תורים לא פעיל
            </h1>
            <p className="text-sm text-slate-600 mb-6">
              באתר הזה לא הופעלה אפשרות הזמנות אונליין.
            </p>
            <Link
              href={adminBasePath}
              className="inline-block px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg transition-colors"
            >
              חזרה לפאנל
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">
                תורים שבוטלו {scope === "day" ? "—" : "— הכל"}
              </h1>
              {scope === "day" && (
                <>
                  <input
                    type="date"
                    value={dateKey}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      if (newKey && siteId) {
                        router.push(`${adminBasePath}/bookings/day/${newKey}/cancelled?scope=day`);
                      }
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-xl font-semibold text-slate-700">
                    {formatDayLabel(selectedDate)}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Scope: לפי יום | הכל */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="group">
                <button
                  type="button"
                  onClick={() => setScope("day")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    scope === "day" ? "bg-sky-600 text-white shadow" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  לפי יום
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    scope === "all" ? "bg-sky-600 text-white shadow" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  הכל
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDeleteAllConfirmOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
                מחק הכל
              </button>
              <Link
                href={`${adminBasePath}/bookings/day/${dateKey}`}
                className="text-sm text-sky-700 hover:text-sky-800"
              >
                ← חזרה ללוח זמנים
              </Link>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {archiveBookings.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 text-sm">
                {scope === "day" ? "אין תורים שבוטלו ביום זה" : "אין תורים שבוטלו"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    {scope === "all" && (
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">
                        תאריך
                      </th>
                    )}
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      שם לקוח
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      טלפון
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      משעה
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      עד שעה
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      שם המטפל
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      סיבת ביטול
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {archiveBookings.map((booking) => (
                    <tr
                      key={booking.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      {scope === "all" && (
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateColumn(booking.date || "")}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-900">
                        {booking.customerName || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {booking.customerPhone || booking.phone || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {booking.time || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {getEndTime(booking, scope === "all" && booking.date ? fromYYYYMMDD(booking.date) : undefined)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {getWorkerName(booking)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="flex-1 text-right">
                            {booking.cancellationReason
                              ? booking.cancellationReason.length > 50
                                ? `${booking.cancellationReason.substring(0, 50)}...`
                                : booking.cancellationReason
                              : "—"}
                          </span>
                          <button
                            onClick={() => handleEditReason(booking)}
                            className="p-1.5 hover:bg-sky-50 rounded text-sky-600 flex-shrink-0"
                            title={booking.cancellationReason ? "ערוך סיבה" : "הוסף סיבה"}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmBookingId(booking.id)}
                          disabled={!isBookingCancelled(booking)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          מחק סופית
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Cancellation Reason Modal */}
      {editingReason && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" 
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancelEditReason();
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">ערוך סיבת ביטול</h3>
              <button
                onClick={handleCancelEditReason}
                className="p-1 hover:bg-slate-100 rounded"
                aria-label="סגור"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {reasonError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                  <p className="text-sm text-red-700">{reasonError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  סיבת ביטול
                </label>
                <textarea
                  value={reasonInput}
                  onChange={(e) => {
                    setReasonInput(e.target.value);
                    setReasonError(null);
                  }}
                  placeholder="הזן סיבת ביטול (אופציונלי)"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  השאר ריק אם אין סיבה ספציפית
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCancelEditReason}
                disabled={savingReason}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveReason}
                disabled={savingReason}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                {savingReason ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmBookingId && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingBookingId) {
              setDeleteConfirmBookingId(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">מחיקה סופית</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 text-right">
                האם למחוק לצמיתות את התור הזה? פעולה זו לא ניתנת לביטול.
              </p>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmBookingId(null)}
                disabled={!!deletingBookingId}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => handleDeletePermanently(deleteConfirmBookingId)}
                disabled={!!deletingBookingId}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                {deletingBookingId ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete all confirmation modal */}
      {deleteAllConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingAll) setDeleteAllConfirmOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">מחיקת כל הארכיון</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 text-right">
                פעולה זו תמחק לצמיתות את כל התורים שבוטלו. להמשיך?
              </p>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteAllConfirmOpen(false)}
                disabled={!!deletingAll}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-sm font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleDeleteAllArchived}
                disabled={!!deletingAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {deletingAll ? "מוחק..." : "מחק הכל"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toastError ? "bg-red-600 text-white" : "bg-slate-800 text-white"
          }`}
          role="alert"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
