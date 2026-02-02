"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  query,
  orderBy,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  bookingsCollection,
  workersCollection,
} from "@/lib/firestorePaths";
import { normalizeBooking, isBookingCancelled } from "@/lib/normalizeBooking";
import { ymdLocal, parseYmdToLocalDate } from "@/lib/dateLocal";
import { fromYYYYMMDD, getMinutesSinceStartOfDay } from "@/lib/calendarUtils";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { bookingEnabled } from "@/lib/bookingEnabled";
import type { SiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import DayScheduleView from "@/components/admin/DayScheduleView";
import MultiWorkerScheduleView from "@/components/admin/MultiWorkerScheduleView";
import WorkerFilter from "@/components/admin/WorkerFilter";
import AdminBookingForm from "@/components/admin/AdminBookingForm";
import { cancelBooking } from "@/lib/booking";
import { X, Plus, Printer } from "lucide-react";
import type { AdminBookingFormInitialData } from "@/components/admin/AdminBookingForm";

const DAY_LABELS: Record<string, string> = {
  "0": "ראשון",
  "1": "שני",
  "2": "שלישי",
  "3": "רביעי",
  "4": "חמישי",
  "5": "שישי",
  "6": "שבת",
};

interface Booking {
  id: string;
  serviceName: string;
  serviceType?: string;
  serviceCategory?: string;
  serviceColor?: string | null;
  workerId: string | null;
  customerName: string;
  customerPhone: string;
  phone?: string;
  date: string;
  time: string;
  startTime?: string;
  durationMin: number;
  note?: string;
  status: "confirmed" | "cancelled" | "active";
  createdAt: string;
  workerName?: string;
  waitMin?: number;
  secondaryDurationMin?: number;
  secondaryWorkerId?: string | null;
  secondaryWorkerName?: string | null;
  secondaryStartAt?: Date | { toDate: () => Date } | null;
  secondaryEndAt?: Date | { toDate: () => Date } | null;
  start?: Date | { toDate: () => Date } | null;
  end?: Date | { toDate: () => Date } | null;
  followUpStartAt?: Date | { toDate: () => Date } | null;
  followUpEndAt?: Date | { toDate: () => Date } | null;
  followUpServiceId?: string | null;
  followUpWorkerId?: string | null;
  phase?: 1 | 2;
  parentBookingId?: string | null;
}

export default function DaySchedulePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteId = params?.siteId as string;
  const dateParam = params?.date as string;

  // Parse date from URL
  const selectedDate = dateParam ? fromYYYYMMDD(dateParam) : new Date();
  const dateKey = ymdLocal(selectedDate);

  // Sentinel value for "All workers" mode (defined outside component to avoid dependency issues)
  const ALL_WORKERS = "all";

  // Worker filter from URL query - "all" means "All workers", otherwise specific worker ID
  // Default to "all" (All workers) if no workerId in URL
  const workerIdFromUrl = searchParams?.get("workerId");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => {
    // Single source of truth: read from URL
    // If missing OR "all" → default to "all" (All workers)
    // Else → use the specific worker ID from URL
    if (!workerIdFromUrl || workerIdFromUrl === ALL_WORKERS) {
      return ALL_WORKERS;
    }
    // Otherwise use the worker ID from URL
    return workerIdFromUrl;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workers, setWorkers] = useState<Array<{ id: string; name: string; services?: string[]; availability?: { day: string; open: string | null; close: string | null }[] }>>([]);
  const [services, setServices] = useState<SiteService[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editInitialData, setEditInitialData] = useState<AdminBookingFormInitialData | null>(null);

  const fallbackUnsubRef = useRef<(() => void) | null>(null);

  // Selected booking for details modal
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  
  // Delete booking state
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Load site config
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        setConfig(cfg);
      },
      (e) => {
        console.error("[DaySchedule] Failed to load site config", e);
      }
    );

    return () => unsubscribe?.();
  }, [siteId]);

  // Load services for color lookup
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribeSiteServices(
      siteId,
      (svcs) => {
        // Only include enabled services
        const enabledServices = svcs.filter((s) => s.enabled !== false);
        setServices(enabledServices);
      },
      (e) => {
        console.error("[DaySchedule] Failed to load services", e);
        setServices([]);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load workers list
  useEffect(() => {
    if (!siteId || !db) return;

    const workersQuery = query(workersCollection(siteId), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || "",
            services: (data.services as string[] | undefined) || [],
            availability: (data.availability as { day: string; open: string | null; close: string | null }[] | undefined) || [],
          };
        });
        setWorkers(items);
        
        // No auto-select needed - default is "all" (All workers)
        // The selectedWorkerId is already set correctly from URL in initial state:
        // - If URL has ?workerId=<id>, it's set to that ID
        // - If URL has ?workerId=all or no param, it's set to "all" (default)
        // We never override the user's selection or the default "all" selection
      },
      (err) => {
        console.error("[DaySchedule] Failed to load workers", err);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load bookings for the selected date and worker(s)
  useEffect(() => {
    if (!siteId || !db || !dateKey) {
      setBookingsLoading(false);
      setLoading(false);
      return;
    }

    setBookingsLoading(true);
    setError(null);

    // Always load ALL bookings for the day (no worker filter) so phase 2 can find its parent (phase 1)
    // for correct slot positioning. Worker filter is applied only for display (which columns to show).
    let bookingsQuery;
    try {
      bookingsQuery = query(
        bookingsCollection(siteId),
        where("date", "==", dateKey),
        orderBy("time", "asc")
      );
    } catch (e) {
      bookingsQuery = query(bookingsCollection(siteId), where("date", "==", dateKey));
    }

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const normalized = snapshot.docs.map((d) => normalizeBooking(d as { id: string; data: () => Record<string, unknown> }));
        const forDay = normalized.filter((b) => b.dateStr === dateKey);
        const notCancelled = forDay.filter((b) => !isBookingCancelled(b));
        notCancelled.sort((a, b) => (a.timeHHmm || "").localeCompare(b.timeHHmm || ""));
        const withWorkerNames = notCancelled.map((b) => {
          const worker = workers.find((w) => w.id === b.workerId);
          return { ...b, workerName: worker?.name } as unknown as Booking;
        });
        setBookings(withWorkerNames);
        setBookingsLoading(false);
        setLoading(false);
      },
      (err) => {
        console.error("[DaySchedule] Failed to load bookings", err);
        // Try fallback query without orderBy
        if (err.message?.includes("index") || err.message?.includes("orderBy")) {
          // Fallback query without orderBy (still all bookings for the day)
          const fallbackQuery = query(
            bookingsCollection(siteId),
            where("date", "==", dateKey)
          );
          const fallbackUnsubscribe = onSnapshot(
            fallbackQuery,
            (snapshot) => {
              const normalized = snapshot.docs.map((d) => normalizeBooking(d as { id: string; data: () => Record<string, unknown> }));
              const forDay = normalized.filter((b) => b.dateStr === dateKey);
              const notCancelled = forDay.filter((b) => !isBookingCancelled(b));
              notCancelled.sort((a, b) => (a.timeHHmm || "").localeCompare(b.timeHHmm || ""));
              const withWorkerNames = notCancelled.map((b) => {
                const worker = workers.find((w) => w.id === b.workerId);
                return { ...b, workerName: worker?.name } as unknown as Booking;
              });
              setBookings(withWorkerNames);
              setBookingsLoading(false);
              setLoading(false);
            },
            (fallbackErr) => {
              console.error("[DaySchedule] Fallback query also failed", fallbackErr);
              setError(fallbackErr.message || "שגיאה בטעינת התורים");
              setBookingsLoading(false);
              setLoading(false);
            }
          );
          fallbackUnsubRef.current = fallbackUnsubscribe;
        } else {
          setError(err.message || "שגיאה בטעינת התורים");
          setBookingsLoading(false);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
      fallbackUnsubRef.current?.();
      fallbackUnsubRef.current = null;
    };
  }, [siteId, dateKey, selectedWorkerId]);

  // Update URL when worker filter changes
  useEffect(() => {
    if (selectedWorkerId === ALL_WORKERS) {
      // "All workers" - set workerId=all in URL
      router.replace(`/site/${siteId}/admin/bookings/day/${dateKey}?workerId=${ALL_WORKERS}`, { scroll: false });
    } else {
      // Specific worker - add workerId to URL
      router.replace(`/site/${siteId}/admin/bookings/day/${dateKey}?workerId=${selectedWorkerId}`, { scroll: false });
    }
  }, [selectedWorkerId, siteId, dateKey, router]);

  // Update bookings with worker names when workers load
  useEffect(() => {
    if (workers.length > 0 && bookings.length > 0) {
      setBookings((prev) =>
        prev.map((booking) => {
          const worker = workers.find((w) => w.id === booking.workerId);
          return {
            ...booking,
            workerName: worker?.name || booking.workerName,
          };
        })
      );
    }
  }, [workers]);

  // Resolve service colors for bookings using services lookup
  // Create lookup maps: serviceName -> color, serviceId -> color
  const serviceColorLookup = useMemo(() => {
    const byName = new Map<string, string>();
    const byId = new Map<string, string>();
    
    services.forEach((service) => {
      const color = service.color || "#3B82F6"; // Default blue
      if (service.name) {
        byName.set(service.name, color);
      }
      if (service.id) {
        byId.set(service.id, color);
      }
    });
    
    return { byName, byId };
  }, [services]);

  // Resolve colors for bookings
  const bookingsWithColors = useMemo(() => {
    const DEFAULT_COLOR = "#3B82F6"; // Default blue
    
    return bookings.map((booking) => {
      // Priority: 1) booking.serviceColor (denormalized), 2) lookup by serviceName, 3) lookup by serviceId, 4) default
      const serviceId = (booking as any).serviceId;
      const resolvedColor = 
        booking.serviceColor || 
        serviceColorLookup.byName.get(booking.serviceName) ||
        (serviceId ? serviceColorLookup.byId.get(serviceId) : null) ||
        DEFAULT_COLOR;
      
      return {
        ...booking,
        serviceColor: resolvedColor,
      };
    });
  }, [bookings, serviceColorLookup]);

  // Day matching uses string key only (dateStr === selectedDateStr); filter out cancelled only
  const forSelectedDay = bookingsWithColors.filter((b) => (b as { dateStr?: string }).dateStr === dateKey || b.date === dateKey);
  const filteredBookings = forSelectedDay.filter((b) => !isBookingCancelled(b));

  // Temporary: remove after confirming bookings render correctly
  if (typeof window !== "undefined") {
    console.log("[DAY_RENDER]", { selectedDateStr: dateKey, selectedWorkerId, count: filteredBookings.length, ids: filteredBookings.map((b) => ({ id: b.id, date: (b as { dateStr?: string }).dateStr ?? b.date, time: (b as { timeHHmm?: string }).timeHHmm ?? b.time, worker: b.workerId, status: b.status })) });
  }

  // Get working hours from config (default 8-20)
  const startHour = 8;
  const endHour = 20;

  const formatDayLabel = (date: Date): string => {
    const dayIndex = date.getDay().toString();
    return `${DAY_LABELS[dayIndex]} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  };

  // Delete booking handlers
  const onRequestDelete = (booking: Booking) => {
    setDeleteError(null);
    setDeleteTarget(booking);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget || !siteId) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await cancelBooking(siteId, deleteTarget.id);
      setDeleteTarget(null);
      // Bookings will update automatically via onSnapshot (cancelled bookings are filtered out)
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

  function buildInitialDataFromBooking(
    booking: Booking,
    allBookings: Booking[]
  ): AdminBookingFormInitialData | null {
    const phase1Doc =
      booking.phase === 2
        ? allBookings.find((b) => b.id === booking.parentBookingId)
        : booking;
    if (!phase1Doc) return null;
    const phase2Doc =
      phase1Doc.phase === 1
        ? allBookings.find((b) => b.parentBookingId === phase1Doc.id)
        : booking.phase === 2
          ? booking
          : null;
    const b1 = phase1Doc;
    const dateStr = (b1 as { dateStr?: string }).dateStr ?? b1.date ?? dateKey;
    const timeStr = (b1 as { timeHHmm?: string }).timeHHmm ?? b1.time ?? "09:00";
    const waitMin = b1.waitMin ?? (b1 as { waitMinutes?: number }).waitMinutes ?? 0;
    const phase2DurationMin = phase2Doc?.durationMin ?? (phase2Doc as { secondaryDurationMin?: number })?.secondaryDurationMin ?? 30;
    const phase2ServiceName = phase2Doc?.serviceName ?? "";

    return {
      phase1Id: phase1Doc.id,
      phase2Id: phase2Doc?.id ?? null,
      customerName: b1.customerName ?? "",
      customerPhone: b1.customerPhone ?? b1.phone ?? "",
      date: dateStr,
      time: timeStr,
      phase1: {
        serviceName: b1.serviceName ?? "",
        serviceTypeId: (b1 as { serviceTypeId?: string }).serviceTypeId ?? null,
        workerId: b1.workerId ?? "",
        workerName: b1.workerName ?? workers.find((w) => w.id === b1.workerId)?.name ?? "",
        durationMin: b1.durationMin ?? 30,
        serviceColor: b1.serviceColor ?? null,
      },
      phase2:
        phase2Doc && phase2ServiceName
          ? {
              enabled: true,
              serviceName: phase2ServiceName,
              waitMinutes: waitMin,
              durationMin: phase2DurationMin,
              workerId: phase2Doc.workerId ?? null,
              workerName: phase2Doc.workerName ?? phase2Doc.secondaryWorkerName ?? null,
            }
          : null,
      note: b1.note ?? null,
      status: b1.status ?? "confirmed",
      price: (b1 as { price?: number }).price ?? null,
    };
  }

  const handleAddBooking = () => {
    setFormMode("create");
    setEditInitialData(null);
    setShowBookingForm(true);
  };

  const handleEditBooking = (booking: Booking) => {
    const initial = buildInitialDataFromBooking(booking, filteredBookings);
    if (initial) {
      setEditInitialData(initial);
      setFormMode("edit");
      setShowBookingForm(true);
    }
    setSelectedBooking(null);
  };

  const handleBookingFormSuccess = () => {
    setShowBookingForm(false);
    setEditInitialData(null);
    setSelectedBooking(null);
  };

  const handleBookingFormCancel = () => {
    setShowBookingForm(false);
    setEditInitialData(null);
  };

  // Bookings for form conflict check (exclude the booking being edited)
  const bookingsForForm = useMemo(() => {
    if (formMode !== "edit" || !editInitialData) return filteredBookings;
    const ids = new Set([editInitialData.phase1Id, editInitialData.phase2Id].filter(Boolean));
    return filteredBookings.filter((b) => !ids.has(b.id));
  }, [filteredBookings, formMode, editInitialData]);

  // Handle booking block click
  const handleBookingClick = (booking: Booking) => {
    setSelectedBooking(booking);
  };

  // Close booking details modal
  const handleCloseModal = () => {
    setSelectedBooking(null);
    setDeleteError(null);
    setDeleteSuccess(false);
  };

  // Handle cancel from modal
  const handleCancelFromModal = async () => {
    if (!selectedBooking || !siteId) return;
    
    // Confirm cancellation
    if (!confirm("האם אתה בטוח שברצונך לבטל את התור הזה?")) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(false);

    try {
      await cancelBooking(siteId, selectedBooking.id);
      setDeleteSuccess(true);
      // Close modal after a brief delay to show success
      setTimeout(() => {
        setSelectedBooking(null);
        setDeleteSuccess(false);
        // Bookings will update automatically via onSnapshot (cancelled bookings are filtered out)
      }, 500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const PHASE2_DEBUG_MODAL = false;

  const formatTime = (d: Date): string =>
    `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  const toDate = (val: Date | { toDate: () => Date } | null | undefined): Date | null => {
    if (val == null) return null;
    if (val instanceof Date) return val;
    if (typeof (val as { toDate: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
    return null;
  };

  useEffect(() => {
    if (!PHASE2_DEBUG_MODAL || !selectedBooking) return;
    const phase = (selectedBooking as { phase?: number }).phase;
    if (phase !== 2) return;
    const startAt = toDate((selectedBooking as { startAt?: unknown }).startAt ?? (selectedBooking as { start?: unknown }).start);
    const endAt = toDate((selectedBooking as { endAt?: unknown }).endAt ?? (selectedBooking as { end?: unknown }).end);
    if (startAt && endAt) {
      console.debug("[PHASE2_DEBUG_MODAL]", selectedBooking.id, phase, startAt.toISOString(), endAt.toISOString());
    }
  }, [selectedBooking]);

  const getEndTime = (booking: Booking, bookingDate?: Date): string => {
    const [hours, minutes] = (booking.time || "00:00").split(":").map(Number);
    const dateToUse = bookingDate || selectedDate;
    const startTime = new Date(dateToUse);
    startTime.setHours(hours, minutes, 0, 0);
    const endTime = new Date(startTime.getTime() + (booking.durationMin || 60) * 60 * 1000);
    return formatTime(endTime);
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
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden" dir="rtl">
      <div className="max-w-7xl mx-auto w-full px-4 py-4 flex flex-col h-full">
        {/* Header - Fixed at top */}
        <div className="flex-shrink-0 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                לוח זמנים - {formatDayLabel(selectedDate)}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={
                  selectedWorkerId !== ALL_WORKERS && selectedWorkerId
                    ? `/site/${siteId}/admin/bookings/print/day/${dateKey}?workerId=${encodeURIComponent(selectedWorkerId)}`
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                title={
                  selectedWorkerId === ALL_WORKERS
                    ? "בחר מטפל להדפסה"
                    : "הדפס לוח זמנים"
                }
                className={
                  selectedWorkerId === ALL_WORKERS
                    ? "inline-flex items-center gap-2 px-3 py-2 bg-slate-200 text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed"
                    : "inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                }
                onClick={(e) => {
                  if (selectedWorkerId === ALL_WORKERS || !selectedWorkerId) {
                    e.preventDefault();
                  }
                }}
                aria-disabled={selectedWorkerId === ALL_WORKERS}
              >
                <Printer className="w-4 h-4" />
                הדפס
              </a>
              <button
                type="button"
                onClick={handleAddBooking}
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                הוסף תור
              </button>
              <Link
                href={`/site/${siteId}/admin/bookings/day/${dateKey}/cancelled`}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                תורים שבוטלו
              </Link>
              <Link
                href={`/site/${siteId}/admin/bookings`}
                className="text-sm text-sky-700 hover:text-sky-800"
              >
                ← חזרה ליומן
              </Link>
            </div>
          </div>

          {/* Worker Filter - show if workers are loaded */}
          {workers.length > 0 && (
            <div className="mb-4">
              <WorkerFilter
                workers={workers}
                selectedWorkerId={selectedWorkerId}
                onWorkerChange={setSelectedWorkerId}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Timeline Schedule - Takes remaining height */}
        {workers.length === 0 ? (
          <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center justify-center">
            <p className="text-sm text-slate-500">טוען עובדים...</p>
          </div>
        ) : selectedWorkerId === ALL_WORKERS ? (
          // All workers mode - multi-column view
          <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 overflow-hidden">
            <MultiWorkerScheduleView
              date={dateKey}
              bookings={filteredBookings}
              workers={workers}
              startHour={startHour}
              endHour={endHour}
              onBookingClick={handleBookingClick}
            />
          </div>
        ) : (
          // Single worker mode
          <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 overflow-hidden">
            <DayScheduleView
              date={dateKey}
              bookings={filteredBookings}
              selectedWorkerId={selectedWorkerId}
              startHour={startHour}
              endHour={endHour}
              onBookingClick={handleBookingClick}
            />
          </div>
        )}
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" 
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseModal();
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">פרטי תור</h3>
              <button
                onClick={handleCloseModal}
                className="p-1 hover:bg-slate-100 rounded"
                aria-label="סגור"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Success message */}
              {deleteSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-right">
                  <p className="text-sm text-green-700">התור בוטל בהצלחה</p>
                </div>
              )}

              {/* Error message */}
              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                  <p className="text-sm text-red-700">שגיאה: {deleteError}</p>
                </div>
              )}

              {/* Booking Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    שם לקוח
                  </label>
                  <p className="text-sm font-medium text-slate-900">
                    {selectedBooking.customerName || "—"}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    טלפון
                  </label>
                  <p className="text-sm text-slate-700">
                    {selectedBooking.customerPhone || selectedBooking.phone || "—"}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    שירות
                  </label>
                  <p className="text-sm text-slate-700">
                    {selectedBooking.serviceName || "—"}
                  </p>
                </div>

                {selectedBooking.serviceType && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      סוג שירות
                    </label>
                    <p className="text-sm text-slate-700">
                      {selectedBooking.serviceType}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    תאריך
                  </label>
                  <p className="text-sm text-slate-700">
                    {formatDayLabel(selectedDate)}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {(selectedBooking as { phase?: number }).phase === 2 ? "שלב 2 (המשך)" : "שלב 1 (ראשוני)"}
                  </label>
                  <p className="text-sm text-slate-700">
                    {selectedBooking.time || "—"} – {getEndTime(selectedBooking)}
                    {selectedBooking.workerName && ` (${selectedBooking.workerName})`}
                  </p>
                </div>

                {(selectedBooking.waitMin ?? 0) > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      המתנה (לא חוסם)
                    </label>
                    <p className="text-sm text-slate-700">
                      {selectedBooking.waitMin} דק׳
                    </p>
                  </div>
                )}

                {(selectedBooking.secondaryDurationMin ?? 0) > 0 && (selectedBooking.secondaryStartAt || selectedBooking.secondaryEndAt) && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      שלב 2 (המשך)
                    </label>
                    <p className="text-sm text-slate-700">
                      {selectedBooking.secondaryStartAt && selectedBooking.secondaryEndAt
                        ? (() => {
                            const s = toDate(selectedBooking.secondaryStartAt);
                            const e = toDate(selectedBooking.secondaryEndAt);
                            return s && e ? `${formatTime(s)} – ${formatTime(e)}` : `${selectedBooking.secondaryDurationMin} דק׳`;
                          })()
                        : `${selectedBooking.secondaryDurationMin} דק׳`}
                      {selectedBooking.secondaryWorkerName && ` (${selectedBooking.secondaryWorkerName})`}
                    </p>
                  </div>
                )}

                {selectedBooking.workerName && !(selectedBooking.secondaryDurationMin ?? 0) && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      מטפל
                    </label>
                    <p className="text-sm text-slate-700">
                      {selectedBooking.workerName}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    סטטוס
                  </label>
                  <p className="text-sm text-slate-700">
                    {selectedBooking.status === "confirmed" ? "מאושר" : "בוטל"}
                  </p>
                </div>

                {selectedBooking.note && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      הערות / סיבת ביטול
                    </label>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedBooking.note}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => selectedBooking && handleEditBooking(selectedBooking)}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium"
              >
                ערוך תור
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
              >
                סגור
              </button>
              <button
                type="button"
                onClick={handleCancelFromModal}
                disabled={deleting || deleteSuccess}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                {deleting ? "מבטל..." : "בטל תור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Booking Form Modal (create / edit) */}
      {showBookingForm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleBookingFormCancel();
          }}
        >
          <AdminBookingForm
            mode={formMode}
            siteId={siteId}
            defaultDate={dateKey}
            workers={workers}
            services={services}
            bookingsForDate={bookingsForForm}
            initialData={formMode === "edit" ? editInitialData ?? undefined : undefined}
            onSuccess={handleBookingFormSuccess}
            onCancel={handleBookingFormCancel}
          />
        </div>
      )}

      {/* Cancel Confirmation Modal (legacy - kept for backward compatibility) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 text-right">
            <h3 className="text-lg font-bold text-slate-900">ביטול תור</h3>
            <p className="mt-2 text-sm text-slate-600">
              לבטל את התור של {deleteTarget.customerName || "לקוח"} בתאריך {deleteTarget.date} בשעה {deleteTarget.time}?
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
                {deleting ? "מבטל..." : "בטל"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
