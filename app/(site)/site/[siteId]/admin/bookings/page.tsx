"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  workersCollection,
  bookingsCollection,
  workerDoc,
  bookingDoc,
  bookingSettingsDoc,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { deleteBooking } from "@/lib/booking";
import { subscribeSiteConfig, saveSiteConfig } from "@/lib/firestoreSiteConfig";
import { bookingEnabled } from "@/lib/bookingEnabled";
import type { SiteConfig } from "@/types/siteConfig";
import {
  subscribeBookingSettings,
  saveBookingSettings,
  ensureBookingSettings,
} from "@/lib/firestoreBookingSettings";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

type BookingTab = "hours" | "calendar";

interface Worker {
  id: string;
  name: string;
  role?: string;
  services?: string[];
  active: boolean;
  createdAt: string;
}

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

interface OpenHours {
  [dayIndex: string]: {
    enabled: boolean;
    start: string;
    end: string;
  };
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

const DEFAULT_OPEN_HOURS: OpenHours = {
  "0": { enabled: true, start: "09:00", end: "18:00" },
  "1": { enabled: true, start: "09:00", end: "18:00" },
  "2": { enabled: true, start: "09:00", end: "18:00" },
  "3": { enabled: true, start: "09:00", end: "18:00" },
  "4": { enabled: true, start: "09:00", end: "18:00" },
  "5": { enabled: true, start: "09:00", end: "13:00" },
  "6": { enabled: false, start: "09:00", end: "18:00" },
};

export default function BookingsAdminPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [activeTab, setActiveTab] = useState<BookingTab>("hours");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>(defaultBookingSettings);
  const [bookingSettingsSaving, setBookingSettingsSaving] = useState(false);

  // Workers state
  const [workers, setWorkers] = useState<any[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerRole, setNewWorkerRole] = useState("");
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editWorkerName, setEditWorkerName] = useState("");
  const [todayBookingsCount, setTodayBookingsCount] = useState<Record<string, number>>({});

  // Calendar state
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsCount, setBookingsCount] = useState<number>(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editBookingStatus, setEditBookingStatus] = useState<"confirmed" | "cancelled">("confirmed");
  const [editBookingWorkerId, setEditBookingWorkerId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  // Delete booking state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hours state (legacy, kept for compatibility with old code)
  const [openHours, setOpenHours] = useState<OpenHours>(DEFAULT_OPEN_HOURS);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);

  // Load site config to check if booking is enabled
  useEffect(() => {
    if (!siteId) return;
    
    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        setConfig(cfg);
        // Fallback to localStorage if Firestore doc doesn't exist
        if (!cfg && typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              setConfig(JSON.parse(raw));
            } catch (e) {
              console.error("Failed to parse localStorage config", e);
            }
          }
        }
      },
      (e) => {
        console.error("Failed to load site config", e);
        // Fallback to localStorage
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              setConfig(JSON.parse(raw));
            } catch (e) {
              console.error("Failed to parse localStorage config", e);
            }
          }
        }
      }
    );

    return () => unsubscribe?.();
  }, [siteId]);

  // Validate siteId and setup realtime listeners
  useEffect(() => {
    if (!siteId) {
      setError("siteId חסר. אנא רענן את הדף.");
      setLoading(false);
      return;
    }

    if (!db) {
      setError("Firebase לא מאותחל. אנא רענן את הדף.");
      setLoading(false);
      return;
    }

    console.log("[BookingManagement] siteId:", siteId);
    const cleanup = setupRealtimeListeners();
    return cleanup;
  }, [siteId]);

  const setupRealtimeListeners = (): (() => void) => {
    if (!db || !siteId) return () => {};

    setLoading(true);

    // Workers listener
    console.log("[BookingManagement] listening sites/" + siteId + "/workers");
    setWorkersLoading(true);
    setWorkersError(null);

    let workersQuery;
    try {
      // Try with orderBy if createdAt exists, otherwise use collection directly
      workersQuery = query(workersCollection(siteId), orderBy("createdAt", "asc"));
    } catch (e) {
      // If orderBy fails (e.g., no createdAt field), use collection directly
      workersQuery = workersCollection(siteId);
    }

    const workersUnsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log("[BookingManagement] workers loaded", items.length);
        setWorkers(items);
        setWorkersLoading(false);
        setWorkersError(null);
        loadTodayBookingsCount(items.map((w: any) => w.id));
      },
      (err) => {
        console.error("[BookingManagement] Failed to load workers", err);
        setWorkersError(err.message);
        setWorkersLoading(false);
        setWorkers([]);
      }
    );

    // Bookings listener
    console.log("[BookingManagement] listening sites/" + siteId + "/bookings");
    setBookingsLoading(true);
    setBookingsError(null);

    const bookingsQuery = query(bookingsCollection(siteId), orderBy("startAt", "asc"));

    const bookingsUnsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setBookingsLoading(false);
        setBookingsError(null);
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        console.log("[BookingManagement] bookings loaded", items.length);
        console.log("[BookingManagement] booking sample", items[0] ?? null);
        console.log("[Admin] first booking date/time:", items[0]?.date, items[0]?.time);
        setBookings(items);
        setBookingsCount(items.length);
        setCalendarLoading(false);
      },
      (err) => {
        console.error("[BookingManagement] Failed to load bookings", err);
        setBookingsLoading(false);
        setBookingsError(err.message);
        setBookings([]);
        setBookingsCount(0);
        setCalendarLoading(false);
      }
    );

    // Settings listener (legacy, kept for compatibility)
    const settingsUnsubscribe = onSnapshot(
      bookingSettingsDoc(siteId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // Update legacy openHours for backward compatibility
          if (data.openHours) {
            setOpenHours(data.openHours);
          }
        }
        setHoursLoading(false);
        setLoading(false);
      },
      (err) => {
        console.error("[ManageBooking] Failed to load settings", err);
        setError("שגיאה בטעינת ההגדרות");
        setHoursLoading(false);
        setLoading(false);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      workersUnsubscribe();
      bookingsUnsubscribe();
      settingsUnsubscribe();
    };
  };


  const loadTodayBookingsCount = async (workerIds: string[]) => {
    if (!db || !siteId) return;
    try {
      const today = ymdLocal(new Date());
      const q = query(
        bookingsCollection(siteId),
        where("date", "==", today),
        where("status", "==", "confirmed")
      );
      const snapshot = await getDocs(q);
      const counts: Record<string, number> = {};
      workerIds.forEach((id) => (counts[id] = 0));
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const workerId = data.workerId;
        if (workerId && counts[workerId] !== undefined) {
          counts[workerId] = (counts[workerId] || 0) + 1;
        }
      });
      setTodayBookingsCount(counts);
    } catch (err) {
      console.error("[ManageBooking] Failed to load today bookings count", err);
    }
  };

  const handleAddWorker = async () => {
    if (!db || !siteId || !newWorkerName.trim()) {
      setError("יש להזין שם עובד");
      return;
    }
    try {
      await addDoc(workersCollection(siteId), {
        name: newWorkerName.trim(),
        role: newWorkerRole.trim() || null,
        services: [],
        active: true,
        createdAt: new Date().toISOString(),
      });
      setNewWorkerName("");
      setNewWorkerRole("");
      setShowAddWorker(false);
      // Workers will update automatically via onSnapshot
    } catch (err) {
      console.error("[ManageBooking] Failed to add worker", err);
      setError("שגיאה בהוספת עובד");
    }
  };

  const handleUpdateWorker = async (workerId: string) => {
    if (!db || !siteId || !editWorkerName.trim()) {
      setError("יש להזין שם עובד");
      return;
    }
    try {
      await updateDoc(workerDoc(siteId, workerId), {
        name: editWorkerName.trim(),
      });
      setEditingWorkerId(null);
      setEditWorkerName("");
      // Workers will update automatically via onSnapshot
    } catch (err) {
      console.error("[ManageBooking] Failed to update worker", err);
      setError("שגיאה בעדכון עובד");
    }
  };

  const handleToggleWorkerActive = async (workerId: string, currentActive: boolean) => {
    if (!db || !siteId) return;
    try {
      await updateDoc(workerDoc(siteId, workerId), {
        active: !currentActive,
      });
      // Workers will update automatically via onSnapshot
    } catch (err) {
      console.error("[ManageBooking] Failed to toggle worker active", err);
      setError("שגיאה בעדכון סטטוס עובד");
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    if (!db || !siteId) return;
    if (!confirm("האם אתה בטוח שברצונך למחוק את העובד?")) return;
    try {
      await deleteDoc(workerDoc(siteId, workerId));
      // Workers will update automatically via onSnapshot
    } catch (err) {
      console.error("[ManageBooking] Failed to delete worker", err);
      setError("שגיאה במחיקת עובד");
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: "confirmed" | "cancelled") => {
    if (!db || !siteId) return;
    try {
      await updateDoc(bookingDoc(siteId, bookingId), {
        status,
      });
      setEditingBookingId(null);
      // Bookings will update automatically via onSnapshot
      await loadTodayBookingsCount(workers.map((w) => w.id));
    } catch (err) {
      console.error("[ManageBooking] Failed to update booking status", err);
      setError("שגיאה בעדכון סטטוס הזמנה");
    }
  };

  const handleUpdateBookingWorker = async (bookingId: string, workerId: string | null) => {
    if (!db || !siteId) return;
    try {
      await updateDoc(bookingDoc(siteId, bookingId), {
        workerId,
      });
      setEditingBookingId(null);
      // Bookings will update automatically via onSnapshot
      await loadTodayBookingsCount(workers.map((w) => w.id));
    } catch (err) {
      console.error("[ManageBooking] Failed to update booking worker", err);
      setError("שגיאה בעדכון עובד להזמנה");
    }
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
      await loadTodayBookingsCount(workers.map((w) => w.id));
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

  const handleSaveHours = async () => {
    if (!db || !siteId) return;
    setHoursSaving(true);
    try {
      await setDoc(
        bookingSettingsDoc(siteId),
        {
          openHours,
        },
        { merge: true }
      );
      setError(null);
      setTimeout(() => setError(null), 2000);
    } catch (err) {
      console.error("[ManageBooking] Failed to save hours", err);
      setError("שגיאה בשמירת שעות פעילות");
    } finally {
      setHoursSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!db || !siteId) return;
    setBookingSettingsSaving(true);
    try {
      await saveBookingSettings(siteId, bookingSettings);
      setError(null);
      setTimeout(() => setError(null), 2000);
    } catch (err) {
      console.error("[ManageBooking] Failed to save settings", err);
      setError("שגיאה בשמירת ההגדרות");
    } finally {
      setBookingSettingsSaving(false);
    }
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

  // Get bookings for selected day
  const getBookingsForDate = (date: string) => {
    return bookings.filter((b: any) => b.date === date && b.status === "confirmed");
  };

  const selectedDayBookings = getBookingsForDate(selectedDay).sort((a: any, b: any) => {
    return (a.time || "").localeCompare(b.time || "");
  });

  // Get worker bookings
  const getWorkerBookings = (workerId: string) => {
    const workerBookings = bookings.filter(
      (b: any) => b.workerId === workerId && b.status === "confirmed"
    );
    const today = formatYMD(new Date());
    const next7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      return formatYMD(date);
    });

    const todayBookings = workerBookings.filter((b: any) => b.date === today);
    const upcomingBookings = workerBookings.filter(
      (b: any) => next7Days.includes(b.date) && b.date !== today
    );

    // Sort by startAt if available, otherwise by date+time
    const sortBookings = (bookings: any[]) => {
      return bookings.sort((a, b) => {
        if (a.startAt && b.startAt) {
          const aMs = a.startAt.toMillis?.() || 0;
          const bMs = b.startAt.toMillis?.() || 0;
          return aMs - bMs;
        }
        const dateCompare = (a.date || "").localeCompare(b.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (a.time || "").localeCompare(b.time || "");
      });
    };

    return {
      today: sortBookings(todayBookings),
      upcoming: sortBookings(upcomingBookings),
    };
  };

  const selectedWorkerBookings = selectedWorkerId ? getWorkerBookings(selectedWorkerId) : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-600 text-sm">טוען…</p>
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

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("hours")}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === "hours"
                  ? "text-sky-600 border-b-2 border-sky-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              שעות פעילות
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === "calendar"
                  ? "text-sky-600 border-b-2 border-sky-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              יומן תורים
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Tab: Hours */}
        {activeTab === "hours" && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-6">שעות פעילות</h2>
            <div className="space-y-4">
              {(["0", "1", "2", "3", "4", "5", "6"] as const).map((dayKey) => {
                const dayConfig = bookingSettings.days[dayKey];
                return (
                  <div
                    key={dayKey}
                    className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg"
                  >
                    <div className="w-24 text-sm font-medium text-slate-700">
                      {DAY_LABELS[dayKey]}
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={dayConfig.enabled}
                        onChange={(e) => {
                          setBookingSettings({
                            ...bookingSettings,
                            days: {
                              ...bookingSettings.days,
                              [dayKey]: { ...dayConfig, enabled: e.target.checked },
                            },
                          });
                        }}
                        className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                      />
                      <span className="text-sm text-slate-600">פעיל</span>
                    </label>
                    {dayConfig.enabled && (
                      <>
                        <input
                          type="time"
                          value={dayConfig.start}
                          onChange={(e) => {
                            setBookingSettings({
                              ...bookingSettings,
                              days: {
                                ...bookingSettings.days,
                                [dayKey]: { ...dayConfig, start: e.target.value },
                              },
                            });
                          }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <span className="text-sm text-slate-600">עד</span>
                        <input
                          type="time"
                          value={dayConfig.end}
                          onChange={(e) => {
                            setBookingSettings({
                              ...bookingSettings,
                              days: {
                                ...bookingSettings.days,
                                [dayKey]: { ...dayConfig, end: e.target.value },
                              },
                            });
                          }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </>
                    )}
                  </div>
                );
              })}
              <div className="pt-4 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  גודל תור (דקות)
                </label>
                <select
                  value={bookingSettings.slotMinutes}
                  onChange={(e) => {
                    setBookingSettings({
                      ...bookingSettings,
                      slotMinutes: Number(e.target.value) as 15 | 30 | 60,
                    });
                  }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value={15}>15 דקות</option>
                  <option value={30}>30 דקות</option>
                  <option value={60}>60 דקות</option>
                </select>
              </div>
              <div className="pt-4">
                <button
                  onClick={async () => {
                    setBookingSettingsSaving(true);
                    try {
                      await saveBookingSettings(siteId, bookingSettings);
                      setError(null);
                    } catch (err) {
                      console.error("Failed to save booking settings", err);
                      setError("שגיאה בשמירת שעות פעילות");
                    } finally {
                      setBookingSettingsSaving(false);
                    }
                  }}
                  disabled={bookingSettingsSaving}
                  className="px-6 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bookingSettingsSaving ? "שומר..." : "שמור שעות פעילות"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Calendar (renamed from "calendar") */}
        {activeTab === "calendar" && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Workers</h2>
              <button
                onClick={() => setShowAddWorker(true)}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add Worker
              </button>
            </div>

            {showAddWorker && (
              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שם עובד *
                    </label>
                    <input
                      type="text"
                      value={newWorkerName}
                      onChange={(e) => setNewWorkerName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="הזן שם עובד"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      תפקיד (אופציונלי)
                    </label>
                    <input
                      type="text"
                      value={newWorkerRole}
                      onChange={(e) => setNewWorkerRole(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="למשל: מעצב ראשי"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddWorker}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium"
                    >
                      שמור
                    </button>
                    <button
                      onClick={() => {
                        setShowAddWorker(false);
                        setNewWorkerName("");
                        setNewWorkerRole("");
                      }}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </div>
            )}

            {workersLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading workers…</p>
            ) : workers.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No workers registered</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {workers.map((worker) => (
                    <div
                      key={worker.id}
                      onClick={() => setSelectedWorkerId(worker.id === selectedWorkerId ? null : worker.id)}
                      className={`p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer ${
                        selectedWorkerId === worker.id
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200"
                      }`}
                    >
                    {editingWorkerId === worker.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editWorkerName}
                          onChange={(e) => setEditWorkerName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateWorker(worker.id)}
                            className="px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded text-sm"
                          >
                            שמור
                          </button>
                          <button
                            onClick={() => {
                              setEditingWorkerId(null);
                              setEditWorkerName("");
                            }}
                            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">{worker.name}</h3>
                            {worker.role && (
                              <p className="text-sm text-slate-600">{worker.role}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1">
                              {todayBookingsCount[worker.id] || 0} תורים היום
                            </p>
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={worker.active}
                              onChange={() => handleToggleWorkerActive(worker.id, worker.active)}
                              className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                            />
                            <span className="text-xs text-slate-600">פעיל</span>
                          </label>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => {
                              setEditingWorkerId(worker.id);
                              setEditWorkerName(worker.name);
                            }}
                            className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                          >
                            ערוך
                          </button>
                          <button
                            onClick={() => handleDeleteWorker(worker.id)}
                            className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                          >
                            מחק
                          </button>
                        </div>
                      </>
                    )}
                    </div>
                  ))}
                </div>

                {/* Selected Worker Appointments */}
                {selectedWorkerId && selectedWorkerBookings && (
                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Appointments for{" "}
                      {workers.find((w) => w.id === selectedWorkerId)?.name || "Worker"}
                    </h3>

                    {selectedWorkerBookings.today.length === 0 &&
                    selectedWorkerBookings.upcoming.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">
                        No appointments for this worker
                      </p>
                    ) : (
                      <div className="space-y-6">
                        {selectedWorkerBookings.today.length > 0 && (
                          <div>
                            <h4 className="text-md font-semibold text-slate-700 mb-3">Today</h4>
                            <div className="space-y-3">
                              {selectedWorkerBookings.today.map((booking: any) => (
                                <div
                                  key={booking.id}
                                  className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow"
                                >
                                  <div className="flex justify-between items-start gap-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm flex-1">
                                      <div>
                                        <span className="text-slate-600">Time:</span>{" "}
                                        <span className="font-medium">{booking.time || "N/A"}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Service:</span>{" "}
                                        <span className="font-medium">
                                          {booking.serviceName || "N/A"}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Customer:</span>{" "}
                                        <span className="font-medium">
                                          {booking.customerName || "N/A"}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Phone:</span>{" "}
                                        <span className="font-medium">
                                          {booking.customerPhone || "N/A"}
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
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedWorkerBookings.upcoming.length > 0 && (
                          <div>
                            <h4 className="text-md font-semibold text-slate-700 mb-3">
                              Upcoming (Next 7 Days)
                            </h4>
                            <div className="space-y-3">
                              {selectedWorkerBookings.upcoming.map((booking: any) => (
                                <div
                                  key={booking.id}
                                  className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow"
                                >
                                  <div className="flex justify-between items-start gap-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm flex-1">
                                      <div>
                                        <span className="text-slate-600">Date:</span>{" "}
                                        <span className="font-medium">{booking.date || "N/A"}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Time:</span>{" "}
                                        <span className="font-medium">{booking.time || "N/A"}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Service:</span>{" "}
                                        <span className="font-medium">
                                          {booking.serviceName || "N/A"}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Customer:</span>{" "}
                                        <span className="font-medium">
                                          {booking.customerName || "N/A"}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-600">Phone:</span>{" "}
                                        <span className="font-medium">
                                          {booking.customerPhone || "N/A"}
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
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 1: Calendar */}
        {activeTab === "calendar" && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Weekly Calendar</h2>
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
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Bookings for {formatDayLabel(new Date(selectedDay + "T00:00:00"))}
                  </h3>
                  {selectedDayBookings.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No bookings for this day</p>
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
                                <span className="text-slate-600">Time:</span>{" "}
                                <span className="font-medium">{booking.time || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Service:</span>{" "}
                                <span className="font-medium">{booking.serviceName || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Worker:</span>{" "}
                                <span className="font-medium">
                                  {booking.workerName || booking.workerId || "Unassigned"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-600">Customer:</span>{" "}
                                <span className="font-medium">{booking.customerName || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Phone:</span>{" "}
                                <span className="font-medium">{booking.customerPhone || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-600">Status:</span>{" "}
                                <span
                                  className={`font-medium ${
                                    booking.status === "confirmed"
                                      ? "text-emerald-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {booking.status || "N/A"}
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
        )}

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

