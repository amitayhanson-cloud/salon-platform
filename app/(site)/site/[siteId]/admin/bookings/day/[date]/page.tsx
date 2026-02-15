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
import { fromYYYYMMDD, getMinutesSinceStartOfDay } from "@/lib/calendarUtils";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { bookingEnabled } from "@/lib/bookingEnabled";
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
import { getAdminBasePathFromSiteId } from "@/lib/url";
import { getDisplayStatus } from "@/lib/bookingRootStatus";
import { useAuth } from "@/hooks/useAuth";
import { X, Plus, Printer, Trash2 } from "lucide-react";
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

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editInitialData, setEditInitialData] = useState<AdminBookingFormSimpleEditData | null>(null);

  const fallbackUnsubRef = useRef<(() => void) | null>(null);

  // Selected booking for details modal
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  
  // Delete booking state
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Delete all client bookings state
  const [deleteAllClientConfirmOpen, setDeleteAllClientConfirmOpen] = useState(false);
  const [deleteAllClientLoading, setDeleteAllClientLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const { firebaseUser } = useAuth();

  // Map workers to WorkerWithServices (add label to availability for AdminBookingForm)
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
        })
      ),
    }));
  }, [workers]);

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
            availability: (data.availability as { day: string; open: string | null; close: string | null }[] | undefined) || [],
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
    setDeleteTarget(booking);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget || !siteId || !firebaseUser) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/bookings/archive-cascade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, bookingId: deleteTarget.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error === "forbidden" ? "אין הרשאה" : data.error || "שגיאה במחיקה");
        return;
      }
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

  // Handle cancel from modal
  const handleCancelFromModal = async () => {
    if (!selectedBooking || !siteId || !firebaseUser) return;
    
    // Confirm cancellation
    if (!confirm("האם אתה בטוח שברצונך לבטל את התור הזה?")) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(false);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/bookings/archive-cascade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, bookingId: selectedBooking.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error === "forbidden" ? "אין הרשאה" : data.error || "שגיאה במחיקה");
        return;
      }
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
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden" dir="rtl">
      <div className="max-w-7xl mx-auto w-full px-4 py-4 flex flex-col h-full">
        {/* Toolbar: sticky below AdminHeader (top-16 = 64px) with z-40 so it stays clickable and is not covered by schedule or sticky header. */}
        <div className="flex-shrink-0 mb-4 sticky top-16 z-40 bg-slate-50 -mx-4 px-4 py-4 -mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                לוח זמנים —
              </h1>
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
                className="rounded-lg border border-slate-300 px-3 py-2 text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <span className="text-xl font-semibold text-slate-700">
                {formatDayLabel(selectedDate)}
              </span>
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
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

        {/* Timeline Schedule - Takes remaining height; z-0 so toolbar (z-40) stays on top and clickable. */}
        {workers.length === 0 ? (
          <div className="flex-1 min-h-0 relative z-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center justify-center">
            <p className="text-sm text-slate-500">טוען עובדים...</p>
          </div>
        ) : selectedWorkerId === ALL_WORKERS ? (
          <div className="flex-1 min-h-0 relative z-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 overflow-hidden">
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
          <div className="flex-1 min-h-0 relative z-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 overflow-hidden">
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
                    {getDisplayStatus(selectedBooking, filteredBookings).label}
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
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap justify-end gap-3">
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

      {/* Remove from calendar (archive) – booking stays in client history */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 text-right">
            <h3 className="text-lg font-bold text-slate-900">הסרת תור מיומן</h3>
            <p className="mt-2 text-sm text-slate-600">
              להסיר את התור של {deleteTarget.customerName || "לקוח"} מתאריך {deleteTarget.date} בשעה {deleteTarget.time}? התור יוסר מהיומן אך יישמר בהיסטוריית הלקוח.
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
                {deleting ? "מסיר..." : "הסר"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
