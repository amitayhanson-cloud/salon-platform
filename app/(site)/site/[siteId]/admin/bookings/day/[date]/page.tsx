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
import { normalizeBooking, isBookingCancelled, isBookingArchived } from "@/lib/normalizeBooking";
import { parseDateParamToDayKey } from "@/lib/dateLocal";
import { fromYYYYMMDD, toYYYYMMDD, getMinutesSinceStartOfDay } from "@/lib/calendarUtils";
import type { BreakRange } from "@/types/bookingSettings";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { subscribeBookingSettings } from "@/lib/firestoreBookingSettings";
import { isBusinessClosedAllDay } from "@/lib/closedDates";
import type { BookingSettings } from "@/types/bookingSettings";
import type { SiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";
import type { OpeningHours, Weekday } from "@/types/booking";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import { subscribePricingItems } from "@/lib/firestorePricing";
import type { PricingItem } from "@/types/pricingItem";
import { getAllClients } from "@/lib/firestoreClients";
import DayScheduleView from "@/components/admin/DayScheduleView";
import MultiWorkerScheduleView from "@/components/admin/MultiWorkerScheduleView";
import WorkerFilter from "@/components/admin/WorkerFilter";
import AdminBookingFormSimple from "@/components/admin/AdminBookingFormSimple";
import AdminCreateBookingForm from "@/components/admin/AdminCreateBookingForm";
import CancelBookingModal from "@/components/admin/CancelBookingModal";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { getDisplayStatus, getDisplayStatusKey } from "@/lib/bookingRootStatus";
import StatusDot from "@/components/StatusDot";
import { useAuth } from "@/hooks/useAuth";
import { X, Plus, Printer, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import type { AdminBookingFormSimpleEditData } from "@/components/admin/AdminBookingFormSimple";

const DAY_LABELS: Record<string, string> = {
  "0": "ראשון",
  "1": "שני",
  "2": "שלישי",
  "3": "רביעי",
  "4": "חמישי",
  "5": "שישי",
  "6": "שבת",
};

const WEEKDAY_LABELS: Record<string, string> = {
  sun: "ראשון",
  mon: "שני",
  tue: "שלישי",
  wed: "רביעי",
  thu: "חמישי",
  fri: "שישי",
  sat: "שבת",
};

const WEEKDAYS_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getDayLabel(day: string): string {
  return DAY_LABELS[day] ?? WEEKDAY_LABELS[day] ?? day;
}

function toWeekday(day: string): Weekday {
  const n = parseInt(day, 10);
  if (Number.isInteger(n) && n >= 0 && n < 7) return WEEKDAYS_ORDER[n];
  return (WEEKDAY_LABELS[day] !== undefined ? day : "sun") as Weekday;
}

/** Add delta days to a YYYY-MM-DD string; returns YYYY-MM-DD. */
function adjacentDateKey(dateKey: string, delta: number): string {
  const d = fromYYYYMMDD(dateKey);
  d.setDate(d.getDate() + delta);
  return toYYYYMMDD(d);
}

interface Booking {
  id: string;
  serviceName: string;
  serviceType?: string;
  serviceTypeId?: string | null;
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
  const adminBasePath = getAdminBasePathFromSiteId(siteId);
  const dateParam = params?.date as string;

  // Stable YYYY-MM-DD only (same as main calendar); avoid DD/MM vs MM/DD
  const dateKey = parseDateParamToDayKey(dateParam);
  const selectedDate = fromYYYYMMDD(dateKey);

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
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  const [existingClients, setExistingClients] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editInitialData, setEditInitialData] = useState<AdminBookingFormSimpleEditData | null>(null);

  const fallbackUnsubRef = useRef<(() => void) | null>(null);

  // Selected booking for details modal
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  
  // Cancel booking: modal asks for reason, then archive-cascade
  const [cancelModalBookingId, setCancelModalBookingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Delete all client bookings state
  const [deleteAllClientConfirmOpen, setDeleteAllClientConfirmOpen] = useState(false);
  const [deleteAllClientLoading, setDeleteAllClientLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const { firebaseUser } = useAuth();

  // Map workers to WorkerWithServices (add label + breaks so AdminCreateBookingForm can enforce worker breaks)
  const workersForForm = useMemo(() => {
    return workers.map((w) => ({
      id: w.id,
      name: w.name,
      services: w.services,
      availability: w.availability?.map(
        (a): OpeningHours => ({
          day: toWeekday(a.day),
          label: getDayLabel(a.day),
          open: a.open ?? null,
          close: a.close ?? null,
          breaks: "breaks" in a && Array.isArray(a.breaks) && a.breaks.length > 0 ? a.breaks : undefined,
        })
      ),
    }));
  }, [workers]);

  // Breaks for the current day (for calendar break blocks)
  const dayBreaks = useMemo((): BreakRange[] | undefined => {
    if (!dateKey || !bookingSettings) return undefined;
    const d = fromYYYYMMDD(dateKey);
    const dayKey = String(d.getDay()) as keyof BookingSettings["days"];
    return bookingSettings.days[dayKey]?.breaks;
  }, [dateKey, bookingSettings]);

  // When viewing a single worker: merge business breaks + that worker's breaks for the day (calendar + consistency)
  const breaksForCalendar = useMemo((): BreakRange[] | undefined => {
    const business = dayBreaks ?? [];
    if (!dateKey || selectedWorkerId === ALL_WORKERS || !selectedWorkerId) {
      return business.length > 0 ? business : undefined;
    }
    const d = fromYYYYMMDD(dateKey);
    const weekdayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()] as string;
    const w = workers.find((x) => x.id === selectedWorkerId);
    const dayConfig = w?.availability?.find((a) => a.day === weekdayKey) as { breaks?: BreakRange[] } | undefined;
    const workerBreaks = dayConfig?.breaks && Array.isArray(dayConfig.breaks) ? dayConfig.breaks : [];
    const merged = [...business, ...workerBreaks];
    return merged.length > 0 ? merged : undefined;
  }, [dateKey, dayBreaks, selectedWorkerId, workers]);

  // Per-worker breaks for the current day (for All Workers view: render break overlays per column)
  const workerBreaksByWorkerId = useMemo((): Record<string, BreakRange[]> => {
    if (!dateKey || workers.length === 0) return {};
    const d = fromYYYYMMDD(dateKey);
    const weekdayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()] as string;
    const out: Record<string, BreakRange[]> = {};
    for (const w of workers) {
      const dayConfig = w?.availability?.find((a) => a.day === weekdayKey) as { breaks?: BreakRange[] } | undefined;
      const breaks = dayConfig?.breaks && Array.isArray(dayConfig.breaks) ? dayConfig.breaks : [];
      if (breaks.length > 0) out[w.id] = breaks;
    }
    return out;
  }, [dateKey, workers]);

  // Load booking settings (for break blocks on calendar)
  useEffect(() => {
    if (!siteId) return;
    const unsubscribe = subscribeBookingSettings(
      siteId,
      (s) => setBookingSettings(s),
      (e) => console.error("[DaySchedule] Failed to load booking settings", e)
    );
    return () => unsubscribe();
  }, [siteId]);

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

  // Load pricing items (service types) for booking form
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribePricingItems(
      siteId,
      (items) => setPricingItems(items),
      (e) => {
        console.error("[DaySchedule] Failed to load pricing items", e);
        setPricingItems([]);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load existing clients for "select customer" in add-booking form
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    getAllClients(siteId)
      .then((list) => {
        if (cancelled) return;
        const mapped = list
          .filter((c) => (c.phone || "").trim() !== "")
          .map((c) => ({
            id: (c.phone || "").replace(/\s|-|\(|\)/g, ""),
            name: (c.name || "").trim(),
            phone: (c.phone || "").trim(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setExistingClients(mapped);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[DaySchedule] Failed to load clients", e);
          setExistingClients([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Load workers list (must finish before showing calendar so booking blocks have columns)
  useEffect(() => {
    if (!siteId || !db) {
      setWorkersLoading(false);
      return;
    }

    setWorkersLoading(true);
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
            availability: (data.availability as { day: string; open: string | null; close: string | null; breaks?: { start: string; end: string }[] }[] | undefined) || [],
            active: data.active !== false,
            allServicesAllowed: data.allServicesAllowed === true,
          };
        });
        setWorkers(items);
        setWorkersLoading(false);
        
        // No auto-select needed - default is "all" (All workers)
        // The selectedWorkerId is already set correctly from URL in initial state:
        // - If URL has ?workerId=<id>, it's set to that ID
        // - If URL has ?workerId=all or no param, it's set to "all" (default)
        // We never override the user's selection or the default "all" selection
      },
      (err) => {
        console.error("[DaySchedule] Failed to load workers", err);
        setWorkersLoading(false);
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

    // Load by both "date" and "dateISO" so slot generation sees the same set as save/conflict check (checkWorkerConflicts uses dateISO).
    type DocSnap = { id: string; data: () => Record<string, unknown> };
    const refByDate = { current: [] as DocSnap[] };
    const refByDateISO = { current: [] as DocSnap[] };

    function mergeAndSetBookings() {
      const byId = new Map<string, DocSnap>();
      for (const d of refByDate.current) byId.set(d.id, d);
      for (const d of refByDateISO.current) byId.set(d.id, d);
      const merged = Array.from(byId.values());
      const normalized = merged.map((d) => normalizeBooking(d));
      const forDay = normalized.filter((b) => (b.dateStr ?? (b as { date?: string }).date) === dateKey);
      const notCancelled = forDay.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));
      notCancelled.sort((a, b) => (a.timeHHmm || "").localeCompare(b.timeHHmm || ""));
      const withWorkerNames = notCancelled.map((b) => {
        const worker = workers.find((w) => w.id === b.workerId);
        return { ...b, workerName: worker?.name } as unknown as Booking;
      });
      setBookings(withWorkerNames);
      setBookingsLoading(false);
      setLoading(false);
    }

    // Query by "date" (with orderBy if index exists)
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

    const unsubscribeDate = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        refByDate.current = snapshot.docs as DocSnap[];
        mergeAndSetBookings();
      },
      (err) => {
        console.error("[DaySchedule] Failed to load bookings (date)", err);
        if (err.message?.includes("index") || err.message?.includes("orderBy")) {
          const fallbackQuery = query(bookingsCollection(siteId), where("date", "==", dateKey));
          const fallbackUnsubscribe = onSnapshot(
            fallbackQuery,
            (snapshot) => {
              refByDate.current = snapshot.docs as DocSnap[];
              mergeAndSetBookings();
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
          mergeAndSetBookings();
        }
      }
    );

    // Query by "dateISO" so we match the same docs the conflict check uses
    const queryDateISO = query(
      bookingsCollection(siteId),
      where("dateISO", "==", dateKey)
    );
    const unsubscribeDateISO = onSnapshot(
      queryDateISO,
      (snapshot) => {
        refByDateISO.current = snapshot.docs as DocSnap[];
        mergeAndSetBookings();
      },
      (err) => {
        console.error("[DaySchedule] Failed to load bookings (dateISO)", err);
        mergeAndSetBookings();
      }
    );

    return () => {
      unsubscribeDate();
      unsubscribeDateISO();
      fallbackUnsubRef.current?.();
      fallbackUnsubRef.current = null;
    };
  }, [siteId, dateKey, selectedWorkerId]);

  // Update URL when worker filter changes
  useEffect(() => {
    if (selectedWorkerId === ALL_WORKERS) {
      router.replace(`${adminBasePath}/bookings/day/${dateKey}?workerId=${ALL_WORKERS}`, { scroll: false });
    } else {
      router.replace(`${adminBasePath}/bookings/day/${dateKey}?workerId=${selectedWorkerId}`, { scroll: false });
    }
  }, [selectedWorkerId, adminBasePath, dateKey, router]);

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

  // Resolve service colors and serviceId for bookings using services lookup
  // Create lookup maps: serviceName -> color, serviceId -> color, serviceName -> serviceId (fallback when doc has no serviceId)
  const serviceColorLookup = useMemo(() => {
    const byName = new Map<string, string>();
    const byId = new Map<string, string>();
    const nameToId = new Map<string, string>();
    const normalize = (s: string) => (s ?? "").trim().toLowerCase();

    services.forEach((service) => {
      const color = service.color || "#3B82F6"; // Default blue
      if (service.name) {
        byName.set(service.name, color);
        nameToId.set(service.name, service.id ?? service.name);
        nameToId.set(normalize(service.name), service.id ?? service.name);
      }
      if (service.id) {
        byId.set(service.id, color);
      }
    });

    return { byName, byId, nameToId, normalize };
  }, [services]);

  // Resolve colors and serviceId for bookings. Phase-2 uses THAT item's service. Fallback: resolve serviceId from serviceName when missing.
  const bookingsWithColors = useMemo(() => {
    const DEFAULT_COLOR = "#3B82F6"; // Default blue

    return bookings.map((booking) => {
      let serviceId = (booking as { serviceId?: string }).serviceId;
      if (serviceId == null && booking.serviceName) {
        const resolved = serviceColorLookup.nameToId.get(booking.serviceName) ?? serviceColorLookup.nameToId.get(serviceColorLookup.normalize(booking.serviceName));
        if (resolved) serviceId = resolved;
      }
      const phase = (booking as { phase?: number }).phase;
      const resolvedColor =
        phase === 2
          ? serviceColorLookup.byName.get(booking.serviceName) ??
            (serviceId ? serviceColorLookup.byId.get(serviceId) : null) ??
            booking.serviceColor ??
            DEFAULT_COLOR
          : booking.serviceColor ||
            serviceColorLookup.byName.get(booking.serviceName) ||
            (serviceId ? serviceColorLookup.byId.get(serviceId) : null) ||
            DEFAULT_COLOR;

      return {
        ...booking,
        serviceColor: resolvedColor,
        serviceId: serviceId ?? (booking as { serviceId?: string }).serviceId,
      };
    });
  }, [bookings, serviceColorLookup]);

  // Day matching uses string key only (dateStr === selectedDateStr); filter out cancelled only
  const forSelectedDay = bookingsWithColors.filter(
    (b) => ((b as { dateStr?: string }).dateStr ?? b.date) === dateKey
  );
  const filteredBookings = forSelectedDay.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));

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
    setCancelModalBookingId(booking.id);
  };

  const handleCancelModalConfirm = async (reason: string) => {
    if (!cancelModalBookingId || !siteId || !firebaseUser) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(false);
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
        setDeleteError(data.error === "forbidden" ? "אין הרשאה" : data.error || "שגיאה במחיקה");
        return;
      }
      setCancelModalBookingId(null);
      setSelectedBooking(null);
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const onRequestDeleteAllClient = () => {
    setDeleteAllClientConfirmOpen(true);
  };

  const onConfirmDeleteAllClient = async () => {
    if (!selectedBooking || !siteId || !firebaseUser) return;
    setDeleteAllClientLoading(true);
    setToastMessage(null);
    setToastError(false);
    try {
      const token = await firebaseUser.getIdToken();
      const clientId = (selectedBooking as { clientId?: string | null }).clientId ?? undefined;
      const res = await fetch("/api/bookings/archive-all-by-client", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          siteId,
          customerPhone: selectedBooking.customerPhone || selectedBooking.phone,
          ...(clientId ? { clientId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToastMessage(data.error === "forbidden" ? "אין הרשאה" : data.error || "שגיאה במחיקה");
        setToastError(true);
        return;
      }
      setToastMessage("כל התורים של הלקוח נמחקו מהיומן");
      setToastError(false);
      setDeleteAllClientConfirmOpen(false);
      setSelectedBooking(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (e) {
      setToastMessage(e instanceof Error ? e.message : "שגיאה במחיקה");
      setToastError(true);
    } finally {
      setDeleteAllClientLoading(false);
    }
  };

  /** Build initial data for the simple edit form (date, time, worker, duration + preserved phase1/phase2 for merge on save). */
  /** When booking is phase 2 (follow-up), sets editingPhase: 2 so form edits the follow-up slot only. */
  function buildSimpleEditInitialData(
    booking: Booking,
    allBookings: Booking[]
  ): AdminBookingFormSimpleEditData | null {
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
    const waitMin = b1.waitMin ?? (b1 as { waitMinutes?: number }).waitMinutes ?? 0;
    const phase2DurationMin =
      phase2Doc?.durationMin ??
      (phase2Doc as { secondaryDurationMin?: number })?.secondaryDurationMin ??
      30;
    const phase2ServiceName = phase2Doc?.serviceName ?? "";

    const isEditingPhase2 = booking.phase === 2 && phase2Doc;
    const sourceDoc = isEditingPhase2 ? phase2Doc : b1;
    const dateStr = (sourceDoc as { dateStr?: string }).dateStr ?? sourceDoc.date ?? dateKey;
    const timeStr = (sourceDoc as { timeHHmm?: string }).timeHHmm ?? sourceDoc.time ?? "09:00";
    const workerId = sourceDoc.workerId ?? "";
    const workerName =
      sourceDoc.workerName ??
      (sourceDoc as { secondaryWorkerName?: string }).secondaryWorkerName ??
      workers.find((w) => w.id === sourceDoc.workerId)?.name ??
      "";
    const durationMin =
      sourceDoc.durationMin ??
      (sourceDoc as { secondaryDurationMin?: number }).secondaryDurationMin ??
      30;

    return {
      date: dateStr,
      time: timeStr,
      workerId,
      workerName,
      durationMin,
      phase1Id: phase1Doc.id,
      phase2Id: phase2Doc?.id ?? null,
      editingPhase: isEditingPhase2 ? 2 : 1,
      customerName: b1.customerName ?? "",
      customerPhone: b1.customerPhone ?? b1.phone ?? "",
      note: b1.note ?? null,
      notes: (b1 as { notes?: string }).notes ?? b1.note ?? null,
      status: b1.status ?? "confirmed",
      price: (b1 as { price?: number }).price ?? null,
      phase1: {
        serviceName: b1.serviceName ?? "",
        serviceTypeId: b1.serviceTypeId ?? (b1 as { serviceTypeId?: string }).serviceTypeId ?? null,
        serviceType: (b1 as { serviceType?: string }).serviceType ?? null,
        serviceColor: b1.serviceColor ?? null,
        serviceId: (b1 as { serviceId?: string }).serviceId ?? null,
      },
      phase2:
        phase2Doc && phase2ServiceName
          ? {
              enabled: true,
              serviceName: phase2ServiceName,
              waitMinutes: waitMin,
              durationMin: phase2DurationMin,
              workerId: phase2Doc.workerId ?? null,
              workerName: phase2Doc.workerName ?? (phase2Doc as { secondaryWorkerName?: string }).secondaryWorkerName ?? null,
              serviceId: (phase2Doc as { serviceId?: string }).serviceId ?? null,
              serviceColor: phase2Doc.serviceColor ?? null,
            }
          : null,
    };
  }

  const handleAddBooking = () => {
    setFormMode("create");
    setEditInitialData(null);
    setShowBookingForm(true);
  };

  const handleEditBooking = (booking: Booking) => {
    const initial = buildSimpleEditInitialData(booking, filteredBookings);
    if (initial) {
      setEditInitialData(initial);
      setFormMode("edit");
      setShowBookingForm(true);
    }
    setSelectedBooking(null);
  };

  const handleBookingFormSuccess = (meta?: {
    createdRecurring?: number;
    failedRecurring?: number;
    failedDetails?: Array<{ date: string; error: string }>;
  }) => {
    setShowBookingForm(false);
    setEditInitialData(null);
    setSelectedBooking(null);
    if (meta?.createdRecurring != null) {
      const msg =
        meta.failedRecurring && meta.failedRecurring > 0
          ? `נוצרו ${meta.createdRecurring} תורים, ${meta.failedRecurring} נכשלו`
          : `נוצרו ${meta.createdRecurring} תורים`;
      setToastMessage(msg);
      setToastError(meta.failedRecurring ? meta.failedRecurring > 0 : false);
      setTimeout(() => setToastMessage(null), 4000);
    }
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

  const workersForSimpleForm = useMemo(
    () => workers.map((w) => ({ id: w.id, name: w.name })),
    [workers]
  );

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

  // Open cancel modal (reason then archive-cascade)
  const handleOpenCancelModal = () => {
    if (selectedBooking) {
      setDeleteError(null);
      setCancelModalBookingId(selectedBooking.id);
    }
  };

  const PHASE2_DEBUG_MODAL = false;

  const formatTime = (d: Date): string =>
    `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  const toDate = (val: unknown): Date | null => {
    if (val == null) return null;
    if (val instanceof Date) return val;
    if (typeof (val as { toDate?: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
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

  if (loading || bookingsLoading || workersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-slate-600 text-sm mb-2">טוען…</p>
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

  // Print: open print-day page in new tab. Uses window.open so it works even if overlays/stacking would block anchor clicks (e.g. in production).
  // When "All workers" is selected, pass workerId=all to print all workers' schedules.
  const handlePrint = () => {
    if (!selectedWorkerId) return;
    const workerParam =
      selectedWorkerId === ALL_WORKERS ? "all" : encodeURIComponent(selectedWorkerId);
    const url = `${adminBasePath}/bookings/print/day/${dateKey}?workerId=${workerParam}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="flex flex-col overflow-hidden w-full"
      style={{ height: "calc(100vh - 4rem)" }}
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto w-full px-4 flex flex-col flex-1 min-h-0">
        {/* Calendar toolbar + filters (fixed; no page padding so calendar sits under header) */}
        <div className="flex-shrink-0 mb-3 bg-white/95 backdrop-blur-sm -mx-4 px-4 py-3 rounded-b-lg border-b border-slate-200/80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                לוח זמנים —
              </h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="היום הבא"
                  onClick={() => {
                    if (!dateKey || !siteId) return;
                    const query = selectedWorkerId && selectedWorkerId !== ALL_WORKERS ? `?workerId=${encodeURIComponent(selectedWorkerId)}` : "";
                    router.push(`${adminBasePath}/bookings/day/${adjacentDateKey(dateKey, 1)}${query}`);
                  }}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                  aria-label="היום הבא"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <input
                  type="date"
                  value={dateKey}
                  onChange={(e) => {
                    const newKey = e.target.value;
                    if (newKey && siteId) {
                      const query = selectedWorkerId && selectedWorkerId !== ALL_WORKERS ? `?workerId=${encodeURIComponent(selectedWorkerId)}` : "";
                      router.push(`${adminBasePath}/bookings/day/${newKey}${query}`);
                    }
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-caleno-500"
                />
                <span className="text-xl font-semibold text-slate-700 min-w-[8rem]">
                  {formatDayLabel(selectedDate)}
                </span>
                <button
                  type="button"
                  title="היום הקודם"
                  onClick={() => {
                    if (!dateKey || !siteId) return;
                    const query = selectedWorkerId && selectedWorkerId !== ALL_WORKERS ? `?workerId=${encodeURIComponent(selectedWorkerId)}` : "";
                    router.push(`${adminBasePath}/bookings/day/${adjacentDateKey(dateKey, -1)}${query}`);
                  }}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                  aria-label="היום הקודם"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="print-day-button"
                title={
                  selectedWorkerId === ALL_WORKERS
                    ? "הדפס לוח זמנים (כל העובדים)"
                    : "הדפס לוח זמנים"
                }
                disabled={!selectedWorkerId}
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Printer className="w-4 h-4" />
                הדפס
              </button>
              <button
                type="button"
                onClick={handleAddBooking}
                className="inline-flex items-center gap-2 px-4 py-2 bg-caleno-500 hover:bg-caleno-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                הוסף תור
              </button>
              <Link
                href={`${adminBasePath}/bookings/day/${dateKey}/cancelled`}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                תורים שבוטלו
              </Link>
              <Link
                href={`${adminBasePath}/bookings`}
                className="text-sm text-caleno-700 hover:text-caleno-800"
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

          {/* Closed date (holiday) banner */}
          {bookingSettings && dateKey && isBusinessClosedAllDay({ bookingSettings, date: dateKey }) && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-right">
              <p className="text-sm font-medium text-amber-800">העסק סגור בתאריך זה</p>
            </div>
          )}
        </div>

        {/* Calendar card: flex-1 min-h-0 so only the grid body scrolls; worker names row is fixed above. */}
        {workers.length === 0 ? (
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center justify-center">
            <p className="text-sm text-slate-500">טוען עובדים...</p>
          </div>
        ) : selectedWorkerId === ALL_WORKERS ? (
          <div className={`flex-1 min-h-0 flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 p-6 ${bookingSettings && dateKey && isBusinessClosedAllDay({ bookingSettings, date: dateKey }) ? "opacity-75" : ""}`}>
            <MultiWorkerScheduleView
              date={dateKey}
              bookings={filteredBookings}
              workers={workers}
              startHour={startHour}
              endHour={endHour}
              breaks={dayBreaks}
              workerBreaksByWorkerId={workerBreaksByWorkerId}
              onBookingClick={handleBookingClick}
            />
          </div>
        ) : (
          <div className={`flex-1 min-h-0 flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 p-6 ${bookingSettings && dateKey && isBusinessClosedAllDay({ bookingSettings, date: dateKey }) ? "opacity-75" : ""}`}>
            <DayScheduleView
              date={dateKey}
              bookings={filteredBookings}
              selectedWorkerId={selectedWorkerId}
              startHour={startHour}
              endHour={endHour}
              breaks={breaksForCalendar}
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
                  <div className="flex items-center gap-2">
                    <StatusDot
                      statusKey={getDisplayStatusKey(selectedBooking, filteredBookings)}
                      size={10}
                    />
                    <span className="font-medium text-sm text-gray-800">
                      {(() => {
                        const label = getDisplayStatus(selectedBooking, filteredBookings).label;
                        const textOnly = label.replace(/^[\p{Emoji}\s]+/u, "").trim();
                        return textOnly || label;
                      })()}
                    </span>
                  </div>
                </div>

                {((selectedBooking as { notes?: string }).notes || selectedBooking.note) && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      הערות
                    </label>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {(selectedBooking as { notes?: string }).notes || selectedBooking.note}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => selectedBooking && handleEditBooking(selectedBooking)}
                className="px-4 py-2 bg-caleno-500 hover:bg-caleno-600 text-white rounded-lg text-sm font-medium"
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
                onClick={handleOpenCancelModal}
                disabled={deleting || deleteSuccess}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                בטל תור
              </button>
              <button
                type="button"
                onClick={onRequestDeleteAllClient}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                מחק את כל התורים של הלקוח
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete all client bookings confirmation */}
      {deleteAllClientConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 text-right">
            <h3 className="text-lg font-bold text-slate-900">מחיקת כל התורים של הלקוח</h3>
            <p className="mt-2 text-sm text-slate-600">
              האם אתה בטוח שברצונך להסיר מהיומן את כל התורים של הלקוח הזה? פעולה זו תמחק/תארכב את כל השירותים והמעקבים שלו מהיומן.
            </p>
            <div className="mt-6 flex gap-3 justify-start">
              <button
                type="button"
                onClick={() => setDeleteAllClientConfirmOpen(false)}
                disabled={deleteAllClientLoading}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={onConfirmDeleteAllClient}
                disabled={deleteAllClientLoading}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteAllClientLoading ? "מוחק..." : "כן, מחק הכל"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toastError ? "bg-red-600 text-white" : "bg-slate-800 text-white"
          }`}
        >
          {toastMessage}
        </div>
      )}

      {/* Admin Booking Form Modal (create / edit) */}
      {showBookingForm && formMode === "create" && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[100]"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleBookingFormCancel();
          }}
        >
          <AdminCreateBookingForm
            siteId={siteId}
            defaultDate={dateKey}
            workers={workersForForm}
            services={services}
            pricingItems={pricingItems}
            existingClients={existingClients}
            bookingsForDate={bookingsForForm}
            onSuccess={handleBookingFormSuccess}
            onCancel={handleBookingFormCancel}
          />
        </div>
      )}

      {showBookingForm && formMode === "edit" && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleBookingFormCancel();
          }}
        >
          <AdminBookingFormSimple
            key={
              formMode === "edit" && editInitialData
                ? editInitialData.editingPhase === 2 && editInitialData.phase2Id
                  ? `edit-phase2-${editInitialData.phase2Id}`
                  : `edit-${editInitialData.phase1Id}`
                : "create"
            }
            mode={formMode}
            siteId={siteId}
            defaultDate={dateKey}
            workers={workersForSimpleForm}
            existingClients={existingClients}
            bookingsForDate={bookingsForForm}
            initialData={formMode === "edit" ? editInitialData ?? undefined : undefined}
            onSuccess={handleBookingFormSuccess}
            onCancel={handleBookingFormCancel}
          />
        </div>
      )}

      {/* Cancel booking modal: reason then archive-cascade */}
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

      {deleteError && cancelModalBookingId && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[56] px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-red-600 text-white" dir="rtl">
          {deleteError}
        </div>
      )}

    </div>
  );
}
