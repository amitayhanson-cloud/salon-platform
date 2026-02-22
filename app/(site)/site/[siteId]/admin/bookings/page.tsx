"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import {
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import {
  bookingsCollection,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { useAuth } from "@/hooks/useAuth";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import type { SiteConfig } from "@/types/siteConfig";
import { getDateRange, getTwoWeekStart, getSundayStart, toYYYYMMDD } from "@/lib/calendarUtils";
import { normalizeBooking, isBookingCancelled, isBookingArchived } from "@/lib/normalizeBooking";
import TwoWeekCalendar from "@/components/admin/TwoWeekCalendar";
import TaskListPanel from "@/components/admin/TaskListPanel";
import CancelBookingModal from "@/components/admin/CancelBookingModal";
import { ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import AutoCleanupSettings from "@/components/admin/AutoCleanupSettings";

interface Booking {
  id: string;
  serviceName: string;
  workerId: string | null;
  customerName: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMin: number;
  note?: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
  startAtMissing?: boolean; // true if startAt field is missing (backward compatibility)
}


export default function BookingsAdminPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);

  // Calendar state
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsCount, setBookingsCount] = useState<number>(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  // Two-week calendar state
  // Always starts on Sunday of the current week (week 1) + next week (week 2) = 14 days
  const [rangeStart, setRangeStart] = useState<Date>(() => {
    // Initialize to Sunday of the week containing today
    return getSundayStart(new Date());
  });

  // Cancel booking: modal asks for reason, then archive-cascade
  const [cancelModalBookingId, setCancelModalBookingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Auto-cleanup settings popover
  const [autoCleanupOpen, setAutoCleanupOpen] = useState(false);
  const [cleanupToast, setCleanupToast] = useState<string | null>(null);
  const [cleanupToastError, setCleanupToastError] = useState(false);

  // Store unsubscribe function reference for manual refresh
  const unsubscribeRef = useRef<(() => void) | null>(null);


  // Load site config to check if booking is enabled
  useEffect(() => {
    if (!siteId) {
      console.log("[BookingManagement] No siteId in config effect");
      return;
    }
    
    console.log("[BookingManagement] Loading site config for siteId:", siteId);
    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        console.log("[BookingManagement] Site config loaded:", cfg ? "exists" : "null");
        setConfig(cfg);
        // Fallback to localStorage if Firestore doc doesn't exist
        if (!cfg && typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              console.log("[BookingManagement] Using localStorage config");
              setConfig(parsed);
            } catch (e) {
              console.error("Failed to parse localStorage config", e);
            }
          }
        }
      },
      (e) => {
        console.error("[BookingManagement] Failed to load site config", e);
        // Fallback to localStorage
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              console.log("[BookingManagement] Using localStorage config (error fallback)");
              setConfig(parsed);
            } catch (e) {
              console.error("Failed to parse localStorage config", e);
            }
          }
        }
      }
    );

    return () => {
      console.log("[BookingManagement] Cleaning up site config subscription");
      unsubscribe?.();
    };
  }, [siteId]);

  // Validate siteId and setup realtime listeners
  useEffect(() => {
    console.log("[BookingManagement] Effect running, siteId:", siteId, "db:", !!db);
    
    if (!siteId) {
      console.error("[BookingManagement] Missing siteId");
      setError("siteId חסר. אנא רענן את הדף.");
      setLoading(false);
      return;
    }

    if (!db) {
      console.error("[BookingManagement] Firebase not initialized");
      setError("Firebase לא מאותחל. אנא רענן את הדף.");
      setLoading(false);
      return;
    }

    console.log("[BookingManagement] Setting up realtime listeners for siteId:", siteId);
    const cleanup = setupRealtimeListeners();
    unsubscribeRef.current = cleanup;
    
    return () => {
      console.log("[BookingManagement] Cleaning up realtime listeners");
      cleanup();
      unsubscribeRef.current = null;
    };
  }, [siteId, rangeStart]);

  const setupRealtimeListeners = (): (() => void) => {
    if (!db || !siteId) {
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    setBookingsLoading(true);
    setBookingsError(null);

    const dateRange = getDateRange(rangeStart, 14);
    const rangeStartStr = toYYYYMMDD(dateRange[0]);
    const rangeEndStr = toYYYYMMDD(dateRange[13]);

    let fallbackUnsubscribe: (() => void) | null = null;

    const bookingsQuery = query(
      bookingsCollection(siteId),
      where("date", ">=", rangeStartStr),
      where("date", "<=", rangeEndStr),
      orderBy("date", "asc"),
      orderBy("time", "asc"),
      limit(500)
    );

    const bookingsUnsubscribe = onSnapshotDebug(
      "bookings-list",
      bookingsQuery,
      (snapshot) => {
        const raw = snapshot.docs.map((d) => normalizeBooking(d as { id: string; data: () => Record<string, unknown> }));
        const normalized = raw.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));
        setBookings(normalized);
        setBookingsCount(normalized.length);
        setBookingsLoading(false);
        setBookingsError(null);
        setLoading(false);
      },
      (err) => {
        if (err.message?.includes("index") || err.message?.includes("orderBy") || (err as { code?: string }).code === "failed-precondition") {
          const fallbackQuery = query(
            bookingsCollection(siteId),
            where("date", ">=", rangeStartStr),
            where("date", "<=", rangeEndStr),
            limit(500)
          );
          fallbackUnsubscribe = onSnapshotDebug(
            "bookings-list-fallback",
            fallbackQuery,
            (snapshot) => {
              const raw = snapshot.docs.map((d) => normalizeBooking(d as { id: string; data: () => Record<string, unknown> }));
              const normalized = raw.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));
              normalized.sort((a, b) => {
                const dc = (a.dateStr || "").localeCompare(b.dateStr || "");
                if (dc !== 0) return dc;
                return (a.timeHHmm || "").localeCompare(b.timeHHmm || "");
              });
              setBookings(normalized);
              setBookingsCount(normalized.length);
              setBookingsError(null);
              setBookingsLoading(false);
              setLoading(false);
            },
            (fallbackErr) => {
              setBookingsError(fallbackErr.message || "שגיאה בטעינת התורים");
              setBookingsLoading(false);
              setLoading(false);
              setBookings([]);
              setBookingsCount(0);
            }
          );
        } else {
          setBookingsError(err.message || "שגיאה בטעינת התורים");
          setBookingsLoading(false);
          setLoading(false);
          setBookings([]);
          setBookingsCount(0);
        }
      }
    );

    return () => {
      bookingsUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  };



  const { firebaseUser } = useAuth();

  const onRequestDelete = (booking: any) => {
    setDeleteError(null);
    setCancelModalBookingId(booking.id);
  };

  const handleCancelModalConfirm = async (reason: string) => {
    if (!cancelModalBookingId || !siteId || !firebaseUser) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/bookings/archive-cascade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          siteId,
          bookingId: cancelModalBookingId,
          cancellationReason: reason || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = data.error || "שגיאה במחיקה";
        const errMsg =
          raw === "forbidden"
            ? "אין הרשאה"
            : typeof raw === "string" && (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota") || raw.includes("exhausted"))
              ? "עומס על המערכת. נסה שוב בעוד רגע."
              : raw;
        setDeleteError(errMsg);
        setTimeout(() => setDeleteError(null), 4000);
        return;
      }
      setCancelModalBookingId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(msg);
      setTimeout(() => setDeleteError(null), 4000);
    } finally {
      setDeleting(false);
      setCancelModalBookingId(null);
    }
  };

  // Get 14-day date range
  const dateRange = getDateRange(rangeStart, 14);
  const dateRangeKeys = dateRange.map(toYYYYMMDD);

  // Group by dateStr (string day key); bookings are already normalized and non-cancelled from listener
  const groupedByDay = dateRangeKeys.reduce((acc, dayKey) => {
    const dayBookings = bookings
      .filter((b: { dateStr?: string }) => (b.dateStr ?? (b as any).date) === dayKey)
      .sort((a: { timeHHmm?: string; time?: string }, b: { timeHHmm?: string; time?: string }) =>
        (a.timeHHmm ?? a.time ?? "").localeCompare(b.timeHHmm ?? b.time ?? "")
      )
      .map((b: any) => ({
        id: b.id,
        time: b.timeHHmm ?? b.time ?? "N/A",
        serviceName: b.serviceName ?? "N/A",
        workerName: b.workerName ?? b.workerId ?? undefined,
      }));
    acc[dayKey] = dayBookings;
    return acc;
  }, {} as Record<string, Array<{ id: string; time: string; serviceName: string; workerName?: string }>>);

  const bookingsByDay = groupedByDay;



  // Add timeout to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.warn("[BookingManagement] Loading timeout - forcing loading to false");
        setLoading(false);
        if (!bookingsError) {
          setError("טעינת הנתונים לוקחת זמן רב. אנא רענן את הדף.");
        }
      }, 10000); // 10 second timeout

      return () => clearTimeout(timeout);
    }
  }, [loading, bookingsError]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-slate-600 text-sm">טוען…</p>
        </div>
      </div>
    );
  }

  if (!siteId) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-right">
          <p className="text-red-700 font-semibold mb-2">שגיאה</p>
          <p className="text-sm text-red-600">siteId חסר. אנא רענן את הדף.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">ניהול הזמנות</h1>
            <div className="flex items-center gap-3">
              <Link
                href={`${getAdminBasePathFromSiteId(siteId)}/bookings/day/${toYYYYMMDD(new Date())}/cancelled`}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                תורים שבוטלו
              </Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAutoCleanupOpen((o) => !o)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  title="מחיקה אוטומטית"
                  aria-expanded={autoCleanupOpen}
                  aria-haspopup="dialog"
                >
                  <Timer className="w-4 h-4" />
                  מחיקה אוטומטית
                </button>
                {autoCleanupOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden="true"
                      onClick={() => setAutoCleanupOpen(false)}
                    />
                    <div
                      className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-xl shadow-lg border border-slate-200 p-4"
                      role="dialog"
                      aria-label="הגדרות מחיקה אוטומטית"
                    >
                      <AutoCleanupSettings
                        siteId={siteId}
                        onToast={(msg, isError) => {
                          setCleanupToast(msg);
                          setCleanupToastError(!!isError);
                          setTimeout(() => setCleanupToast(null), 4000);
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
              <Link
                href={getAdminBasePathFromSiteId(siteId)}
                className="text-sm text-caleno-700 hover:text-caleno-800"
              >
                ← חזרה לפאנל ניהול
              </Link>
            </div>
          </div>

        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Calendar */}
        <div className="mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">יומן תורים (14 יום)</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Move back by 14 days (maintains Sunday anchor)
                    const newStart = new Date(rangeStart);
                    newStart.setDate(rangeStart.getDate() - 14);
                    setRangeStart(newStart);
                  }}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm flex items-center gap-1"
                >
                  <ChevronRight className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => {
                    // Navigate to today's day schedule page
                    const today = new Date();
                    const todayKey = toYYYYMMDD(today);
                    // Get current workerId from URL if available, or use first worker
                    // For now, navigate without workerId - the day page will handle default selection
                    router.push(`${getAdminBasePathFromSiteId(siteId)}/bookings/day/${todayKey}`);
                  }}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    // Move forward by 14 days (maintains Sunday anchor)
                    const newStart = new Date(rangeStart);
                    newStart.setDate(rangeStart.getDate() + 14);
                    setRangeStart(newStart);
                  }}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm flex items-center gap-1"
                >
                  Next
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {bookingsLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading bookings…</p>
            ) : bookingsError ? (
              <p className="text-sm text-red-600 text-center py-8">Error: {bookingsError}</p>
            ) : (
              <TwoWeekCalendar
                dateRange={dateRange}
                bookingsByDay={bookingsByDay}
                onDayClick={(date) => {
                  // Navigation handled by TwoWeekCalendar component
                }}
                siteId={siteId}
              />
            )}
          </div>

        {/* Tasks (below calendar) */}
        <div className="mt-4">
          <TaskListPanel siteId={siteId} maxHeight="280px" />
        </div>
        </div>

      </div>

      <CancelBookingModal
        open={!!cancelModalBookingId}
        bookingId={cancelModalBookingId ?? ""}
        onConfirm={handleCancelModalConfirm}
        onClose={() => {
          setCancelModalBookingId(null);
          setDeleteError(null);
        }}
        submitting={deleting}
      />

      {deleteError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[56] px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-red-600 text-white" dir="rtl">
          {deleteError}
        </div>
      )}

      {cleanupToast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[56] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            cleanupToastError ? "bg-red-600 text-white" : "bg-slate-800 text-white"
          }`}
          dir="rtl"
        >
          {cleanupToast}
        </div>
      )}
    </div>
  );
}

