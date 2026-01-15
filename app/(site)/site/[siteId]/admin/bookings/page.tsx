"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  bookingsCollection,
  workersCollection,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { deleteBooking } from "@/lib/booking";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { bookingEnabled } from "@/lib/bookingEnabled";
import type { SiteConfig } from "@/types/siteConfig";

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

const DAY_LABELS: Record<string, string> = {
  "0": "ראשון",
  "1": "שני",
  "2": "שלישי",
  "3": "רביעי",
  "4": "חמישי",
  "5": "שישי",
  "6": "שבת",
};

export default function BookingsAdminPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);

  // Calendar state
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsCount, setBookingsCount] = useState<number>(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Weekly calendar state
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day; // Sunday as week start
    return new Date(today.setDate(diff));
  });
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    return ymdLocal(new Date());
  });
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // Workers state (for filter dropdown)
  const [workers, setWorkers] = useState<Array<{ id: string; name: string }>>([]);

  // Delete booking state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


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
    
    return () => {
      console.log("[BookingManagement] Cleaning up realtime listeners");
      cleanup();
    };
  }, [siteId]);

  const setupRealtimeListeners = (): (() => void) => {
    if (!db || !siteId) {
      console.log("[BookingManagement] No db or siteId, skipping listener setup");
      setLoading(false);
      return () => {};
    }

    console.log("[BookingManagement] Setting up listeners for siteId:", siteId);
    setLoading(true);
    setBookingsLoading(true);
    setBookingsError(null);

    // Workers listener (for filter dropdown)
    console.log("[BookingManagement] listening sites/" + siteId + "/workers");
    let workersQuery;
    try {
      workersQuery = query(workersCollection(siteId), orderBy("createdAt", "asc"));
    } catch (e) {
      workersQuery = workersCollection(siteId);
    }
    const workersUnsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, name: d.data().name || "" })) as Array<{ id: string; name: string }>;
        setWorkers(items);
        console.log("[BookingManagement] workers loaded for filter", items.length);
      },
      (err) => {
        console.error("[BookingManagement] Failed to load workers", err);
      }
    );

    // Bookings listener
    console.log("[BookingManagement] listening sites/" + siteId + "/bookings");
    
    let fallbackUnsubscribe: (() => void) | null = null;
    
    const bookingsQuery = query(bookingsCollection(siteId), orderBy("startAt", "asc"));

    const bookingsUnsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        console.log("[BookingManagement] Bookings snapshot received, docs:", snapshot.docs.length);
        setBookingsLoading(false);
        setBookingsError(null);
        setLoading(false); // FIX: Set loading to false when data loads
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        console.log("[BookingManagement] bookings loaded", items.length);
        if (items.length > 0) {
          console.log("[BookingManagement] booking sample", items[0]);
          console.log("[Admin] first booking date/time:", items[0]?.date, items[0]?.time);
        }
        setBookings(items);
        setBookingsCount(items.length);
        setCalendarLoading(false);
      },
      (err) => {
        console.error("[BookingManagement] Failed to load bookings", err);
        
        // If orderBy failed due to missing index, try without orderBy
        if (err.message?.includes("index") || err.message?.includes("orderBy") || err.code === "failed-precondition") {
          console.log("[BookingManagement] Retrying without orderBy due to index error");
          const fallbackQuery = bookingsCollection(siteId);
          fallbackUnsubscribe = onSnapshot(
            fallbackQuery,
            (snapshot) => {
              console.log("[BookingManagement] Fallback query succeeded, docs:", snapshot.docs.length);
              const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
              // Sort manually by date/time
              items.sort((a: any, b: any) => {
                if (a.startAt && b.startAt && a.startAt.toMillis && b.startAt.toMillis) {
                  return a.startAt.toMillis() - b.startAt.toMillis();
                }
                const dateCompare = (a.date || "").localeCompare(b.date || "");
                if (dateCompare !== 0) return dateCompare;
                return (a.time || "").localeCompare(b.time || "");
              });
              setBookings(items);
              setBookingsCount(items.length);
              setBookingsError(null);
              setBookingsLoading(false);
              setLoading(false);
            },
            (fallbackErr) => {
              console.error("[BookingManagement] Fallback query also failed", fallbackErr);
              setBookingsError(fallbackErr.message || "שגיאה בטעינת התורים");
              setBookingsLoading(false);
              setLoading(false);
              setBookings([]);
              setBookingsCount(0);
              setCalendarLoading(false);
            }
          );
        } else {
          // Other error - just set loading to false
          setBookingsLoading(false);
          setBookingsError(err.message || "שגיאה בטעינת התורים");
          setLoading(false); // FIX: Set loading to false on error
          setBookings([]);
          setBookingsCount(0);
          setCalendarLoading(false);
        }
      }
    );

    // Cleanup listeners on unmount
    return () => {
      console.log("[BookingManagement] Cleaning up listeners");
      workersUnsubscribe();
      bookingsUnsubscribe();
      if (fallbackUnsubscribe) {
        fallbackUnsubscribe();
      }
    };
  };



  // Delete booking handlers
  const onRequestDelete = (booking: any) => {
    setDeleteError(null);
    setDeleteTarget(booking);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget || !siteId) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteBooking(siteId, deleteTarget.id);
      setDeleteTarget(null);
      // Bookings will update automatically via onSnapshot
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const onCancelDelete = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };


  // Date helper functions
  const startOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Sunday as week start
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Use ymdLocal helper instead of local formatYMD
  const formatYMD = ymdLocal;

  const formatDayLabel = (date: Date): string => {
    const dayIndex = date.getDay().toString();
    return `${DAY_LABELS[dayIndex]} ${date.getDate()}`;
  };

  // Get week days array (7 days starting from weekStart)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filter bookings for current week
  const weekDayKeys = weekDays.map(formatYMD);
  const bookingsForWeek = bookings.filter((b: any) => weekDayKeys.includes(b.date));

  // Group bookings by day
  const bookingsByDay = weekDayKeys.reduce((acc, dayKey) => {
    acc[dayKey] = bookingsForWeek.filter((b: any) => b.date === dayKey);
    return acc;
  }, {} as Record<string, any[]>);

  // Get bookings for selected day, optionally filtered by worker
  const getBookingsForDate = (date: string, workerId: string | null = null) => {
    let filtered = bookings.filter((b: any) => b.date === date && b.status === "confirmed");
    if (workerId) {
      filtered = filtered.filter((b: any) => b.workerId === workerId);
    }
    return filtered;
  };

  const selectedDayBookings = getBookingsForDate(selectedDay, selectedWorkerId).sort((a: any, b: any) => {
    return (a.time || "").localeCompare(b.time || "");
  });


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
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center">
          <p className="text-slate-600 text-sm mb-2">טוען…</p>
          <p className="text-xs text-slate-400">siteId: {siteId || "לא זמין"}</p>
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

  // Check if booking is enabled
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
              href={`/site/${siteId}/admin`}
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
          {/* Debug info */}
          <div className="mb-2 p-2 bg-slate-100 rounded text-xs text-slate-600 text-right">
            siteId: {siteId}
          </div>
          <div className="mb-2 p-2 bg-slate-100 rounded text-xs text-slate-600 text-right">
            bookings loaded: {bookingsCount} {bookingsCount === 0 && "(אין תורים עדיין)"}
          </div>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">ניהול הזמנות</h1>
            <Link
              href={`/site/${siteId}/admin`}
              className="text-sm text-sky-700 hover:text-sky-800"
            >
              ← חזרה לפאנל ניהול
            </Link>
          </div>

        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Calendar */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">יומן תורים</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setWeekStart(startOfWeek(addDays(weekStart, -7)))}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                >
                  Today
                </button>
                <button
                  onClick={() => setWeekStart(startOfWeek(addDays(weekStart, 7)))}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                >
                  Next →
                </button>
              </div>
            </div>

            {bookingsLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading bookings…</p>
            ) : bookingsError ? (
              <p className="text-sm text-red-600 text-center py-8">Error: {bookingsError}</p>
            ) : (
              <>
                {/* Weekly Calendar Grid */}
                <div className="grid grid-cols-7 gap-2 mb-6">
                  {weekDays.map((day) => {
                    const dayKey = formatYMD(day);
                    const dayBookings = (bookingsByDay[dayKey] || []).filter(
                      (b: any) => b.status === "confirmed"
                    );
                    const isSelected = selectedDay === dayKey;
                    const isToday = dayKey === formatYMD(new Date());

                    return (
                      <div
                        key={dayKey}
                        onClick={() => setSelectedDay(dayKey)}
                        className={`border rounded-lg p-2 cursor-pointer transition-colors min-h-[120px] ${
                          isSelected
                            ? "border-sky-500 bg-sky-50"
                            : "border-slate-200 hover:border-slate-300"
                        } ${isToday ? "bg-blue-50" : ""}`}
                      >
                        <div className="text-xs font-semibold text-slate-700 mb-1">
                          {formatDayLabel(day)}
                        </div>
                        <div className="text-xs text-slate-500 mb-2">
                          {dayBookings.length} {dayBookings.length === 1 ? "booking" : "bookings"}
                        </div>
                        <div className="space-y-1">
                          {dayBookings.slice(0, 3).map((booking: any) => (
                            <div
                              key={booking.id}
                              className="text-xs bg-sky-100 text-sky-700 rounded px-1 py-0.5 truncate"
                              title={`${booking.time} ${booking.serviceName} (${booking.workerName || "Unassigned"})`}
                            >
                              {booking.time} {booking.serviceName}
                            </div>
                          ))}
                          {dayBookings.length > 3 && (
                            <div className="text-xs text-slate-500">
                              +{dayBookings.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Day Bookings List */}
                <div className="border-t border-slate-200 pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">
                      תורים עבור {formatDayLabel(new Date(selectedDay + "T00:00:00"))}
                    </h3>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600">בחר עובד:</label>
                      <select
                        value={selectedWorkerId || ""}
                        onChange={(e) => setSelectedWorkerId(e.target.value || null)}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-right"
                      >
                        <option value="">כל העובדים</option>
                        {workers.map((worker) => (
                          <option key={worker.id} value={worker.id}>
                            {worker.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {selectedDayBookings.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      {selectedWorkerId 
                        ? `אין תורים עבור ${workers.find(w => w.id === selectedWorkerId)?.name || "עובד זה"} ביום זה`
                        : "אין תורים ליום זה"}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDayBookings.map((booking: any) => {
                        // Debug log to confirm date/time/startAt
                        console.log("[Admin] booking date/time/startAt", 
                          booking.date, 
                          booking.time, 
                          booking.startAt?.toDate?.()?.toString?.()
                        );
                        return (
                        <div
                          key={booking.id}
                          className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm flex-1">
                              <div>
                                <span className="text-slate-600">שעה:</span>{" "}
                                <span className="font-medium">{booking.time || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">שירות:</span>{" "}
                                <span className="font-medium">{booking.serviceName || "N/A"}</span>
                              </div>
                              {!selectedWorkerId && (
                                <div>
                                  <span className="text-slate-600">עובד:</span>{" "}
                                  <span className="font-medium">
                                    {booking.workerName || booking.workerId || "לא מוקצה"}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-slate-600">לקוח:</span>{" "}
                                <span className="font-medium">{booking.customerName || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">טלפון:</span>{" "}
                                <span className="font-medium">{booking.customerPhone || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">סטטוס:</span>{" "}
                                <span
                                  className={`font-medium ${
                                    booking.status === "confirmed"
                                      ? "text-emerald-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {booking.status === "confirmed" ? "מאושר" : "בוטל"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRequestDelete(booking)}
                              disabled={deleting}
                              className="px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              מחק תור
                            </button>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 text-right">
            <h3 className="text-lg font-bold text-slate-900">מחיקת תור</h3>
            <p className="mt-2 text-sm text-slate-600">
              למחוק את התור של {deleteTarget.customerName || "לקוח"} בתאריך {deleteTarget.date} בשעה {deleteTarget.time}?
            </p>

            {deleteError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">שגיאה: {deleteError}</p>
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-start">
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>

              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

