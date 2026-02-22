"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebaseClient";
import { doc, getDoc, onSnapshot, query, where, getDocs, orderBy } from "firebase/firestore";
import { collection } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { bookingsCollection, bookingSettingsDoc } from "@/lib/firestorePaths";
import {
  formatDateForDisplay,
  formatDateShort,
} from "@/lib/timeSlots";
import { ymdLocal } from "@/lib/dateLocal";
import { useRouter } from "next/navigation";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import {
  subscribeBookingSettings,
  ensureBookingSettings,
} from "@/lib/firestoreBookingSettings";
import { isClosedDate } from "@/lib/closedDates";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import { defaultThemeColors } from "@/types/siteConfig";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import type { SiteService } from "@/types/siteConfig";
import { subscribePricingItems } from "@/lib/firestorePricing";
import type { PricingItem } from "@/types/pricingItem";
import type { OpeningHours } from "@/types/booking";
import { getWorkerBusyIntervals, overlaps } from "@/lib/bookingPhases";
import {
  canWorkerPerformService,
  workersWhoCanPerformService,
  workersWhoCanPerformServiceForService,
  workerCanDoServiceForService,
} from "@/lib/workerServiceCompatibility";
import {
  getChainTotalDuration,
  resolveChainWorkers,
  repairInvalidAssignments,
  validateChainAssignments,
  computeAvailableSlots,
  buildChainWithFinishingService,
  type ChainServiceInput,
} from "@/lib/multiServiceChain";
import { saveMultiServiceBooking } from "@/lib/booking";
import { getSiteUrl } from "@/lib/tenant";
import type { MultiBookingCombo, MultiBookingSelectionPayload } from "@/types/multiBookingCombo";
import { subscribeMultiBookingCombos, findMatchingCombo } from "@/lib/firestoreMultiBookingCombos";
import {
  getBookingScheduleDayKey,
  getDayConfig,
  getJsDow,
  jsDayToWeekdayKey,
} from "@/lib/scheduleDayMapping";

type TimestampLike = { toDate: () => Date };

function normalizeTimestampLike(value: unknown): TimestampLike | undefined {
  if (value == null) return undefined;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const v = value as { toDate: () => Date };
    try {
      const d = v.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return v;
    } catch {
      return undefined;
    }
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return { toDate: () => d };
    return undefined;
  }
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return { toDate: () => value };
    return undefined;
  }
  return undefined;
}

type PhaseForDate = {
  kind: string;
  startAt: TimestampLike;
  endAt: TimestampLike;
  durationMin: number;
  workerId?: string | null;
};

function normalizePhases(value: unknown): PhaseForDate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: PhaseForDate[] = [];
  for (const item of value) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = typeof o.kind === "string" ? o.kind : undefined;
    const durationMin = typeof o.durationMin === "number" ? o.durationMin : undefined;
    const startAt = normalizeTimestampLike(o.startAt);
    const endAt = normalizeTimestampLike(o.endAt);
    if (kind === undefined || durationMin === undefined || !startAt || !endAt) continue;
    out.push({
      kind,
      startAt,
      endAt,
      durationMin,
      workerId: o.workerId === undefined || o.workerId === null ? undefined : (o.workerId as string) ?? null,
    });
  }
  return out.length ? out : undefined;
}

type BookingStep = 1 | 2 | 3 | 4 | 5 | 6; // 6 = success

/** Today YYYY-MM-DD in the given IANA timezone. */
function getTodayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** Current hour (0–23) and minute (0–59) in the given IANA timezone. */
function getNowInTimeZone(timeZone: string): { hours: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const str = formatter.format(new Date());
  const [hours, minutes] = str.split(":").map(Number);
  return { hours, minutes };
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<BookingStep>(1);
  
  // Services and pricing items from Firestore
  const [services, setServices] = useState<SiteService[]>([]);
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  
  // Booking settings from Firestore
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>(defaultBookingSettings);
  const [workers, setWorkers] = useState<Array<{ id: string; name: string; role?: string; services?: string[]; availability?: OpeningHours[]; active?: boolean }>>([]);
  const [workersLoading, setWorkersLoading] = useState<boolean>(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  
  type BookingForDate = {
    id: string;
    workerId: string | null;
    time: string;
    status: string;
    durationMin?: number;
    date?: string;
    dateISO?: string;
    waitMin?: number;
    waitMinutes?: number;
    secondaryDurationMin?: number;
    secondaryWorkerId?: string | null;
    secondaryStartAt?: { toDate: () => Date };
    secondaryEndAt?: { toDate: () => Date };
    startAt?: { toDate: () => Date };
    endAt?: { toDate: () => Date };
    followUpStartAt?: { toDate: () => Date };
    followUpEndAt?: { toDate: () => Date };
    followUpWorkerId?: string | null;
    followUpServiceId?: string | null;
    phases?: Array<{ kind: string; startAt: { toDate: () => Date }; endAt: { toDate: () => Date }; durationMin: number; workerId?: string | null }>;
  };
  const [bookingsForDate, setBookingsForDate] = useState<BookingForDate[]>([]);

  // Booking form state: list of { service, pricingItem } for multi-service support
  const [selectedServices, setSelectedServices] = useState<Array<{ service: SiteService; pricingItem: PricingItem }>>([]);
  const [expandingServiceId, setExpandingServiceId] = useState<string | null>(null);
  /** Multi-booking mode: when true, user can add multiple services; when false, single-service only (unchanged from original flow). */
  const [isMultiBooking, setIsMultiBooking] = useState(false);
  /** Rule-based combos (service types + optional auto steps). */
  const [multiBookingCombos, setMultiBookingCombos] = useState<MultiBookingCombo[]>([]);
  // Derived for single-service path (backward compat)
  const selectedService = selectedServices[0]?.service ?? null;
  const selectedPricingItem = selectedServices[0]?.pricingItem ?? null;
  const [selectedWorker, setSelectedWorker] = useState<{ id: string; name: string } | null>(null);
  const [phase2WorkerAssigned, setPhase2WorkerAssigned] = useState<{ id: string; name: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [timeUpdatedByWorkerMessage, setTimeUpdatedByWorkerMessage] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientNote, setClientNote] = useState("");

  // Date picker navigation state
  const [dateWindowStart, setDateWindowStart] = useState<Date>(() => {
    // Start from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const DATE_WINDOW_SIZE = 14; // Show 14 days at a time

  // ============================================================================
  // SHARED HELPER FUNCTIONS (Single Source of Truth)
  // Must be defined before use in computed values (eligibleWorkers, etc.)
  // ============================================================================

  // Helper functions for time conversion
  function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }

  const siteTimezone = config?.archiveRetention?.timezone;

  // Shared helper: Resolve business day config for a date (single source of truth).
  // Uses date.getDay() (0=Sun..6=Sat) in LOCAL time to match Admin schedule.days["0"]..["6"].
  // Calendar dates are built in user local time; do NOT use site timezone here or days will mismatch.
  function resolveBusinessDayConfig(date: Date): { enabled: boolean; start: string; end: string } | null {
    const jsDow = date.getDay(); // 0=Sun..6=Sat in LOCAL time
    const dayConfig = getDayConfig(bookingSettings, jsDow);
    return dayConfig;
  }

  // Shared helper: Resolve worker day config for a date
  // Returns the worker's day configuration (day, open, close) for the given date
  function resolveWorkerDayConfig(
    worker: { availability?: OpeningHours[] },
    date: Date
  ): OpeningHours | null {
    if (!worker.availability || !Array.isArray(worker.availability) || worker.availability.length === 0) {
      return null; // No availability config
    }

    const dayIndex = getJsDow(date, siteTimezone);
    const weekdayKey = jsDayToWeekdayKey(dayIndex);
    
    // Find worker's schedule for this day
    const workerDayConfig = worker.availability.find((day) => day.day === weekdayKey);
    
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] resolveWorkerDayConfig:`, {
        date: ymdLocal(date),
        jsDayIndex: dayIndex,
        weekdayKey,
        hasAvailability: Array.isArray(worker.availability) && worker.availability.length > 0,
        allWorkerDays: worker.availability.map(d => d.day),
        foundConfig: workerDayConfig ? {
          day: workerDayConfig.day,
          open: workerDayConfig.open,
          close: workerDayConfig.close,
          isClosed: !workerDayConfig.open || !workerDayConfig.close,
        } : null,
      });
    }
    
    return workerDayConfig || null;
  }

  // ============================================================================
  // FILTERING FUNCTIONS (Single Responsibility)
  // ============================================================================

  // Filter 1: Centralized worker–service compatibility (single source of truth)
  function workerCanDoService(
    worker: { services?: string[]; active?: boolean },
    serviceIdOrName: string
  ): boolean {
    return canWorkerPerformService(worker, serviceIdOrName);
  }

  // Filter 2: Check if worker is working on a date (business hours + worker availability)
  function isWorkerWorkingOnDate(
    worker: { availability?: OpeningHours[]; active?: boolean },
    date: Date
  ): boolean {
    // Worker must be active
    if (worker.active === false) {
      return false;
    }

    // Business must be open on this date (Rank 1: Business hours)
    const businessDayConfig = resolveBusinessDayConfig(date);
    if (!businessDayConfig || !businessDayConfig.enabled) {
      return false; // Business closed
    }

    // Worker must be available on this date (Rank 2: Worker availability)
    const workerDayConfig = resolveWorkerDayConfig(worker, date);
    if (!workerDayConfig) {
      // No config = assume available (backward compatibility)
      return true;
    }

    // Worker day must be open (not closed)
    if (!workerDayConfig.open || !workerDayConfig.close) {
      return false; // Worker day is closed
    }

    return true;
  }

  // Filter 3: Get worker's working window for a date (in minutes)
  // Default: workers work business hours for a day unless they have a different (or closed) config.
  function getWorkerWorkingWindow(
    worker: { availability?: OpeningHours[] },
    date: Date
  ): { startMin: number; endMin: number } | null {
    const businessWindow = getBusinessWindow(date);
    const workerDayConfig = resolveWorkerDayConfig(worker, date);

    // No config for this weekday (or no availability at all) → default to business hours
    if (!workerDayConfig) {
      return businessWindow;
    }
    // Explicitly closed (open/close null or missing) → not working
    if (!workerDayConfig.open || !workerDayConfig.close) {
      return null;
    }

    return {
      startMin: timeToMinutes(workerDayConfig.open),
      endMin: timeToMinutes(workerDayConfig.close),
    };
  }

  // Filter 4: Get business working window for a date (in minutes)
  function getBusinessWindow(date: Date): { startMin: number; endMin: number } | null {
    const businessDayConfig = resolveBusinessDayConfig(date);
    if (!businessDayConfig || !businessDayConfig.enabled) {
      return null; // Business closed
    }

    return {
      startMin: timeToMinutes(businessDayConfig.start),
      endMin: timeToMinutes(businessDayConfig.end),
    };
  }

  // Filter 5: Check if slot fits within both business and worker windows
  function isSlotWithinWindows(
    slotStartMinutes: number,
    slotEndMinutes: number,
    businessWindow: { startMin: number; endMin: number } | null,
    workerWindow: { startMin: number; endMin: number } | null
  ): boolean {
    // Business window is required (Rank 1)
    if (!businessWindow) {
      return false;
    }

    // Worker window is required if worker has availability config (Rank 2)
    // If worker has no config, only check business window (backward compatibility)
    if (workerWindow) {
      // Slot must fit within BOTH windows (intersection)
      const effectiveStart = Math.max(businessWindow.startMin, workerWindow.startMin);
      const effectiveEnd = Math.min(businessWindow.endMin, workerWindow.endMin);
      
      if (effectiveEnd <= effectiveStart) {
        return false; // No overlap
      }
      
      return slotStartMinutes >= effectiveStart && slotEndMinutes <= effectiveEnd;
    } else {
      // No worker config: only check business window
      return slotStartMinutes >= businessWindow.startMin && slotEndMinutes <= businessWindow.endMin;
    }
  }

  // Filter 6: Check if slot conflicts with worker-blocking phases only (primary + secondary; wait ignored)
  function doesSlotConflictWithWorker(
    slotStartMinutes: number,
    slotEndMinutes: number,
    workerId: string,
    bookings: BookingForDate[],
    dateStr: string
  ): boolean {
    const busyIntervals = getWorkerBusyIntervals(bookings, workerId, dateStr);
    return busyIntervals.some((interval) =>
      overlaps(slotStartMinutes, slotEndMinutes, interval.startMin, interval.endMin)
    );
  }

  // Helper: Check if a time slot fits within a worker's working hours
  // Returns true only if slotStartMinutes >= startMinutes AND slotEndMinutes <= endMinutes
  function isWithinWorkingHours(
    dayConfig: OpeningHours | null,
    slotStartMinutes: number,
    slotEndMinutes: number
  ): boolean {
    // If dayConfig is missing or closed, slot is not available
    if (!dayConfig || !dayConfig.open || !dayConfig.close) {
      return false;
    }

    // Parse dayConfig.start and dayConfig.end (strings like "09:00") into minutes
    const startMinutes = timeToMinutes(dayConfig.open);
    const endMinutes = timeToMinutes(dayConfig.close);

    // Return true only if slot fits fully within working hours
    return slotStartMinutes >= startMinutes && slotEndMinutes <= endMinutes;
  }

  // Load site config from Firestore
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (cfg) {
          setConfig(cfg);
        } else {
          // Fallback to localStorage
          if (typeof window !== "undefined") {
            try {
              const configRaw = window.localStorage.getItem(`siteConfig:${siteId}`);
              if (configRaw) {
                setConfig(JSON.parse(configRaw));
              } else {
                setConfig(defaultSiteConfig);
              }
            } catch (e) {
              console.error("Failed to load site config", e);
              setConfig(defaultSiteConfig);
            }
          } else {
            setConfig(defaultSiteConfig);
          }
        }
      },
      (e) => {
        console.error("Failed to load site config from Firestore", e);
        // Fallback to localStorage
        if (typeof window !== "undefined") {
          try {
            const configRaw = window.localStorage.getItem(`siteConfig:${siteId}`);
            if (configRaw) {
              setConfig(JSON.parse(configRaw));
            } else {
              setConfig(defaultSiteConfig);
            }
          } catch (err) {
            console.error("Failed to load site config", err);
            setConfig(defaultSiteConfig);
          }
        } else {
          setConfig(defaultSiteConfig);
        }
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [siteId]);

  // Load services from Firestore (same source as admin Services page)
  useEffect(() => {
    if (!siteId) return;

    console.log(`[Booking] Loading services for siteId=${siteId}`);
    const unsubscribeServices = subscribeSiteServices(
      siteId,
      (svcs) => {
        console.log(`[Booking] Loaded ${svcs.length} services from sites/${siteId}.services`);
        // Only show enabled services
        const enabledServices = svcs.filter((s) => s.enabled !== false);
        console.log(`[Booking] Filtered to ${enabledServices.length} enabled services:`, enabledServices.map(s => ({ id: s.id, name: s.name, enabled: s.enabled })));
        setServices(enabledServices);
      },
      (err) => {
        console.error("[Booking] Failed to load services", err);
        setServices([]);
      }
    );

    return () => {
      unsubscribeServices();
    };
  }, [siteId]);

  // Load pricing items from Firestore
  useEffect(() => {
    if (!siteId) return;

    console.log(`[Booking] Loading pricing items for siteId=${siteId}`);
    const unsubscribePricing = subscribePricingItems(
      siteId,
      (items) => {
        console.log(`[Booking] Loaded ${items.length} pricing items`);
        // Filter out items without serviceId (price is optional - NOT filtered here)
        // Price can be null/undefined/0 and items will still be shown
        const validItems = items.filter((item) => {
          const serviceId = item.serviceId || item.service;
          return !!serviceId;
        });
        console.log(`[Booking] Filtered to ${validItems.length} valid pricing items (with serviceId):`, validItems.map(p => ({ id: p.id, serviceId: p.serviceId || p.service, type: p.type, hasPrice: !!(p.price || (p.priceRangeMin && p.priceRangeMax)) })));
        setPricingItems(validItems);
      },
      (err) => {
        console.error("[Booking] Failed to load pricing items", err);
        setPricingItems([]);
      }
    );

    return () => {
      unsubscribePricing();
    };
  }, [siteId]);

  // Load multi-booking combos (for combo matching when isMultiBooking)
  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeMultiBookingCombos(siteId, (list) => {
      setMultiBookingCombos(list);
    });
    return () => unsub();
  }, [siteId]);

  // Load booking settings and workers (subscribe as soon as siteId is ready so we receive real-time updates when admin changes open days)
  useEffect(() => {
    if (!siteId || !db || typeof window === "undefined") return;

    // Ensure booking settings exist
    ensureBookingSettings(siteId).catch((e) => {
      console.error("Failed to ensure booking settings", e);
    });

    // Load booking settings from Firestore
    const settingsUnsubscribe = subscribeBookingSettings(
      siteId,
      (settings) => {
        if (process.env.NODE_ENV !== "production") {
          const docPath = `sites/${siteId}/settings/booking`;
          const updatedAt = (settings as { updatedAt?: { toDate?: () => Date } }).updatedAt;
          const date = updatedAt?.toDate?.();
          const updatedAtStr = date instanceof Date ? date.toISOString() : "n/a";
          const daysSummary = Object.entries(settings.days ?? {}).map(([key, day]) => ({
            key,
            jsDay: key,
            enabled: day?.enabled,
            hours: `${day?.start ?? "?"}-${day?.end ?? "?"}`,
          }));
          console.log(`[Booking] bookingSettings doc=${docPath} updatedAt=${updatedAtStr} rawDays=`, daysSummary);
        }
        setBookingSettings(settings);
        setLoading(false);
      },
      (err) => {
        console.error("[Booking] Failed to load booking settings", err);
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[Booking] Falling back to default booking settings for site ${siteId}`);
        }
        setBookingSettings(defaultBookingSettings);
        setLoading(false);
      }
    );

    // Load workers from Firestore
    setWorkersLoading(true);
    const workersRef = collection(db, "sites", siteId, "workers");
    const workersQuery = query(workersRef, orderBy("name", "asc"));
    const workersUnsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const workersList: Array<{ id: string; name: string; role?: string; services?: string[]; availability?: OpeningHours[]; active?: boolean }> = [];
        const excludedWorkers: Array<{ name: string; reason: string }> = [];
        
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const workerName = data.name || docSnap.id;
          
          // Filter by active status (default to true if not set)
          if (data.active === false) {
            excludedWorkers.push({ name: workerName, reason: "active=false (disabled)" });
            return;
          }
          
          // Parse availability if present
          let availability: OpeningHours[] | undefined = undefined;
          if (data.availability && Array.isArray(data.availability)) {
            availability = data.availability.map((day: any) => ({
              day: day.day || "sun",
              label: day.label || "",
              open: day.open || null,
              close: day.close || null,
              breaks: day.breaks && Array.isArray(day.breaks) ? day.breaks.map((b: { start: string; end: string }) => ({ start: b.start, end: b.end })) : undefined,
            })) as OpeningHours[];
          }
          
          // Include worker (active is true or undefined, which defaults to true)
          workersList.push({
            id: docSnap.id,
            name: data.name || "",
            role: data.role,
            services: data.services || [], // Empty/missing = worker can do zero services (see workerServiceCompatibility)
            availability, // Include availability schedule
            active: data.active !== false,
          });
        });
        
        console.log(`[Booking] Workers loaded from sites/${siteId}/workers: ${workersList.length} active workers`);
        if (excludedWorkers.length > 0) {
          console.log(`[Booking] Excluded ${excludedWorkers.length} workers:`, excludedWorkers);
        }
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Booking] Worker details:`, workersList.map(w => ({ 
            id: w.id,
            name: w.name, 
            active: w.active,
            hasServices: Array.isArray(w.services) && w.services.length > 0,
            servicesCount: w.services?.length || 0,
            hasAvailability: Array.isArray(w.availability) && w.availability.length > 0,
            availabilityCount: w.availability?.length || 0,
            availability: w.availability?.map(day => ({
              day: day.day,
              label: day.label,
              open: day.open,
              close: day.close,
              isClosed: !day.open || !day.close,
            })) || []
          })));
        }
        
        setWorkers(workersList);
        setWorkersLoading(false);
        setWorkersError(null);
      },
      (err) => {
        console.error("[Booking] Failed to load workers", err);
        setWorkersError("שגיאה בטעינת העובדים");
        setWorkersLoading(false);
      }
    );

    return () => {
      settingsUnsubscribe();
      workersUnsubscribe();
    };
  }, [siteId]);

  // Load bookings for selected date: query by both "date" and "dateISO" so we match
  // the same set the save/conflict path uses (checkWorkerConflicts queries by dateISO).
  useEffect(() => {
    if (!db || !siteId || !selectedDate) {
      setBookingsForDate([]);
      return;
    }

    const dateStr = ymdLocal(selectedDate);

    function docToBooking(docSnap: { id: string; data: () => Record<string, unknown> }, dateLabel: string): BookingForDate | null {
      const data = docSnap.data();
      if (data.isArchived === true) return null;
      const timeVal = (data.timeHHmm ?? data.time ?? "") as string;
      const durationMin = (data.durationMin ?? data.duration ?? 60) as number;
      return {
        id: docSnap.id,
        workerId: (data.workerId as string) || null,
        time: timeVal,
        status: (data.status as string) || "booked",
        durationMin: typeof durationMin === "number" ? durationMin : 60,
        date: dateLabel,
        dateISO: (data.dateISO ?? data.date ?? dateLabel) as string,
        startAt: normalizeTimestampLike(data.startAt),
        endAt: normalizeTimestampLike(data.endAt),
        waitMin: (data.waitMin ?? data.waitMinutes ?? 0) as number,
        waitMinutes: (data.waitMinutes ?? data.waitMin ?? 0) as number,
        secondaryDurationMin: (data.secondaryDurationMin ?? 0) as number,
        secondaryWorkerId: (data.secondaryWorkerId as string) || null,
        secondaryStartAt: normalizeTimestampLike(data.secondaryStartAt),
        secondaryEndAt: normalizeTimestampLike(data.secondaryEndAt),
        followUpStartAt: normalizeTimestampLike(data.followUpStartAt),
        followUpEndAt: normalizeTimestampLike(data.followUpEndAt),
        followUpWorkerId: (data.followUpWorkerId as string) || null,
        followUpServiceId: (data.followUpServiceId as string) || null,
        phases: normalizePhases(data.phases),
      };
    }

    const byDateRef = { current: [] as BookingForDate[] };
    const byDateISORef = { current: [] as BookingForDate[] };
    function mergeAndSet() {
      const byId = new Map<string, BookingForDate>();
      for (const b of byDateRef.current) byId.set(b.id, b);
      for (const b of byDateISORef.current) byId.set(b.id, b);
      setBookingsForDate(Array.from(byId.values()));
    }

    const qByDate = query(
      bookingsCollection(siteId),
      where("date", "==", dateStr),
      where("status", "in", ["confirmed", "active", "booked"])
    );
    const unsubDate = onSnapshot(
      qByDate,
      (snapshot) => {
        const list: BookingForDate[] = [];
        snapshot.forEach((docSnap) => {
          const b = docToBooking(docSnap, dateStr);
          if (b) list.push(b);
        });
        byDateRef.current = list;
        mergeAndSet();
      },
      (err) => {
        console.error("Failed to load bookings for date (date)", err);
        mergeAndSet();
      }
    );

    const qByDateISO = query(
      bookingsCollection(siteId),
      where("dateISO", "==", dateStr),
      where("status", "in", ["confirmed", "active", "booked"])
    );
    const unsubDateISO = onSnapshot(
      qByDateISO,
      (snapshot) => {
        const list: BookingForDate[] = [];
        snapshot.forEach((docSnap) => {
          const b = docToBooking(docSnap, dateStr);
          if (b) list.push(b);
        });
        byDateISORef.current = list;
        mergeAndSet();
      },
      (err) => {
        console.error("Failed to load bookings for date (dateISO)", err);
        mergeAndSet();
      }
    );

    return () => {
      unsubDate();
      unsubDateISO();
    };
  }, [siteId, selectedDate]);

  /**
   * Create a default pricing item for services that don't have any pricing items
   * This allows booking to proceed even when no pricing items exist
   * Price is optional - services without prices are still bookable
   */
  const getDefaultPricingItem = (service: SiteService): PricingItem => {
    return {
      id: `default_${service.id}`,
      serviceId: service.name,
      service: service.name,
      type: null,
      durationMinMinutes: 30,
      durationMaxMinutes: 30,
      price: undefined,
      priceRangeMin: undefined,
      priceRangeMax: undefined,
      notes: undefined,
      hasFollowUp: false,
      followUp: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: 0,
    };
  };

  /**
   * Helper function to determine if booking options are available
   * Returns true if there are enabled services (price is NOT a requirement)
   */
  const hasBookingOptions = (): boolean => {
    if (services.length === 0) {
      console.log(`[Booking] hasBookingOptions: false - no services loaded`);
      return false;
    }
    // Price is NOT required - all enabled services are bookable
    console.log(`[Booking] hasBookingOptions: true - ${services.length} enabled services available (price is optional)`);
    return true;
  };

  /**
   * Get all enabled services for booking
   * Price is optional - services are shown regardless of whether they have pricing items or prices
   * This ensures services without prices are still available for booking
   */
  const bookableServices = services; // All enabled services are bookable, price is optional

  // Get pricing items for selected service
  // If no pricing items exist, create a default one (price is optional)
  const pricingItemsForService = selectedService
    ? (() => {
        const matchingItems = pricingItems.filter((item) => {
          const itemServiceId = item.serviceId || item.service;
          return itemServiceId === selectedService.name;
        });
        // If no pricing items exist, create a default one to allow booking
        if (matchingItems.length === 0) {
          console.log(`[Booking] Service "${selectedService.name}" has no pricing items, creating default`);
          return [getDefaultPricingItem(selectedService)];
        }
        return matchingItems;
      })()
    : [];

  // Generate dates for the current window (starting from dateWindowStart)
  function generateDateWindow(startDate: Date, windowSize: number): Date[] {
    const dates: Date[] = [];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    for (let i = 0; i < windowSize; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }

    return dates;
  }

  // Get today's date (for comparison)
  function getToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  // Check if we can navigate backward (not before today)
  function canNavigateBackward(): boolean {
    const today = getToday();
    const windowStart = new Date(dateWindowStart);
    windowStart.setHours(0, 0, 0, 0);
    
    // Can go back if window start is after today
    return windowStart > today;
  }

  // Navigate to next window
  function handleNextDateWindow() {
    setDateWindowStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + DATE_WINDOW_SIZE);
      return next;
    });
  }

  // Navigate to previous window
  function handlePrevDateWindow() {
    if (!canNavigateBackward()) return;
    
    setDateWindowStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - DATE_WINDOW_SIZE);
      
      // Ensure we don't go before today
      const today = getToday();
      if (next < today) {
        return today;
      }
      
      return next;
    });
  }

  // Generate available dates for current window
  const availableDates = generateDateWindow(dateWindowStart, DATE_WINDOW_SIZE);

  // ============================================================================
  // STEP 1 → STEP 2: Filter workers by first service only (workerCanDoService). No availability here.
  // ============================================================================
  const firstServiceForEligibility = selectedServices.length > 0 ? selectedServices[0]!.service : null;
  const eligibleWorkers = (() => {
    if (selectedServices.length === 0 || !firstServiceForEligibility) return [];
    const firstService = firstServiceForEligibility;
    const firstPricing = selectedServices[0]!.pricingItem;
    // Use id + name so both ID and name matching work (workers store names in worker.services)
    const canDoPhase1 = workersWhoCanPerformServiceForService(workers, {
      id: firstService.id,
      name: firstService.name,
      displayName: (firstService as { displayName?: string }).displayName,
    });

    // Single-service with follow-up: only capability — at least one worker must be able to do phase 2
    if (selectedServices.length === 1) {
      const phase2Name = firstPricing?.followUp?.name?.trim() ?? "";
      const workersWhoCanDoPhase2 = phase2Name
        ? workersWhoCanPerformService(workers, phase2Name)
        : [];
      const followUpDurationRaw = firstPricing?.followUp?.durationMinutes;
      const hasFollowUp =
        firstPricing?.hasFollowUp === true &&
        typeof followUpDurationRaw === "number" &&
        followUpDurationRaw >= 1;
      if (hasFollowUp && phase2Name && workersWhoCanDoPhase2.length === 0) return [];
    }

    return canDoPhase1;
  })();

  // TODO: Remove TEMP debug block and workerEligibilityDebug UI once eligibility is verified in production
  // TEMP debug: worker eligibility
  const workerEligibilityDebug =
    process.env.NODE_ENV === "development" &&
    firstServiceForEligibility &&
    (() => {
      const serviceKey = {
        serviceId: firstServiceForEligibility.id,
        serviceName: firstServiceForEligibility.name,
        categoryId: (firstServiceForEligibility as { category?: string }).category,
      };
      const first10 = workers.slice(0, 10).map((w) => {
        const allowedRaw = (w as { services?: unknown[] }).services ?? [];
        const canDo = workerCanDoServiceForService(w, {
          id: firstServiceForEligibility.id,
          name: firstServiceForEligibility.name,
          displayName: (firstServiceForEligibility as { displayName?: string }).displayName,
        });
        return {
          workerId: w.id,
          workerName: w.name,
          allowedServicesRaw: JSON.stringify(allowedRaw),
          workerCanDoService: canDo,
        };
      });
      if (typeof console !== "undefined" && console.table) {
        console.log("[Booking] Worker eligibility — service key:", serviceKey);
        console.log("[Booking] Workers loaded:", workers.length, "Eligible:", eligibleWorkers.length);
        console.table(first10);
      }
      return {
        workersLoaded: workers.length,
        workersEligible: eligibleWorkers.length,
        serviceKeyUsed: `${serviceKey.serviceId ?? ""}|${serviceKey.serviceName ?? ""}`.trim() || "(empty)",
      };
    })();

  const [ineligibleWorkerMessage, setIneligibleWorkerMessage] = useState(false);

  // Reset worker if not eligible when services change; show message when cleared
  useEffect(() => {
    if (selectedServices.length > 0 && selectedWorker) {
      const isEligible = eligibleWorkers.some((w) => w.id === selectedWorker.id);
      if (!isEligible) {
        setIneligibleWorkerMessage(true);
        setSelectedWorker(null);
      }
    }
  }, [selectedServices, eligibleWorkers, selectedWorker]);

  // Clear ineligible message when user selects a worker or changes services
  useEffect(() => {
    if (selectedWorker !== null || selectedServices.length === 0) setIneligibleWorkerMessage(false);
  }, [selectedWorker, selectedServices.length]);

  // Reset date window to today when worker changes
  useEffect(() => {
    if (selectedWorker) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setDateWindowStart(today);
      // Also reset selected date when worker changes
      setSelectedDate(null);
    }
  }, [selectedWorker]);

  const hasSecondaryPhase = (selectedPricingItem?.secondaryDurationMin ?? selectedPricingItem?.followUp?.durationMinutes ?? 0) > 0;

  // Debug: Log worker availability when date is selected (dev only)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" && selectedDate && selectedService) {
      const dayIndex = getJsDow(selectedDate, siteTimezone);
      const weekdayKey = jsDayToWeekdayKey(dayIndex);
      
      console.log(`[Booking] === Worker Availability Check for Date ${ymdLocal(selectedDate)} ===`);
      console.log(`[Booking] Date: ${ymdLocal(selectedDate)}, JS dayIndex: ${dayIndex}, weekdayKey: "${weekdayKey}"`);
      console.log(`[Booking] Total workers: ${workers.length}, Eligible workers: ${eligibleWorkers.length}`);
      
      eligibleWorkers.forEach((worker) => {
        const workerDayConfig = resolveWorkerDayConfig(worker, selectedDate);
        const isDayClosed = workerDayConfig && (!workerDayConfig.open || !workerDayConfig.close);
        
        console.log(`[Booking] Worker "${worker.name}" (${worker.id}):`, {
          active: worker.active !== false,
          hasAvailability: Array.isArray(worker.availability) && worker.availability.length > 0,
          availabilityDays: worker.availability?.map(d => d.day) || [],
          dayConfig: workerDayConfig ? {
            day: workerDayConfig.day,
            open: workerDayConfig.open,
            close: workerDayConfig.close,
            isClosed: isDayClosed,
          } : "no config",
          dayClosed: isDayClosed,
          availableForDay: !isDayClosed && workerDayConfig !== null,
        });
        
        // Regression guard: If worker day is closed, they must not be available
        if (isDayClosed && process.env.NODE_ENV !== "production") {
          console.warn(`[Booking] REGRESSION GUARD: Worker "${worker.name}" has day ${weekdayKey} closed - should be excluded from availability`);
        }
      });
    }
  }, [selectedDate, selectedService, workers, eligibleWorkers]);

  const selectedTypeIdsForCombo = useMemo(() => {
    if (!isMultiBooking || selectedServices.length <= 1) return [];
    return selectedServices.map((s) => s.pricingItem.id).filter((id): id is string => id != null && id !== "");
  }, [isMultiBooking, selectedServices]);

  const hasValidMultiBookingCombo = useMemo(() => {
    if (!isMultiBooking || selectedServices.length <= 1) return true;
    return findMatchingCombo(multiBookingCombos, selectedTypeIdsForCombo) != null;
  }, [isMultiBooking, selectedServices.length, multiBookingCombos, selectedTypeIdsForCombo]);

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        if (selectedServices.length < 1) return false;
        if (isMultiBooking && selectedServices.length > 1 && !hasValidMultiBookingCombo) return false;
        return true;
      case 2:
        // Worker selection is optional, but we need at least one eligible worker available
        // If no eligible workers, disable next step
        return eligibleWorkers.length > 0;
      case 3:
        return selectedDate !== null;
      case 4:
        return selectedTime !== "";
      case 5:
        return clientName.trim() !== "" && clientPhone.trim() !== "";
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (isStepValid() && step < 5) {
      setStep((step + 1) as BookingStep);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as BookingStep);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isStepValid() || selectedServices.length === 0 || !selectedDate || !selectedTime || !db) {
      if (!db) setSubmitError("Firebase לא מאותחל. אנא רענן את הדף.");
      return;
    }

    const tz = config?.archiveRetention?.timezone || "Asia/Jerusalem";
    const todayStr = getTodayInTimeZone(tz);
    const bookingDateStr = (() => {
      try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const parts = formatter.formatToParts(selectedDate);
        const y = parts.find((p) => p.type === "year")?.value ?? "";
        const m = parts.find((p) => p.type === "month")?.value ?? "";
        const d = parts.find((p) => p.type === "day")?.value ?? "";
        return `${y}-${m}-${d}`;
      } catch {
        return ymdLocal(selectedDate);
      }
    })();
    if (bookingDateStr < todayStr) {
      setSubmitError("לא ניתן להזמין תור לתאריך שעבר. אנא בחרו תאריך מהיום ואילך.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const bookingDate = ymdLocal(selectedDate);
      const [hh, mm] = selectedTime.split(":").map(Number);
      const startAt = new Date(selectedDate);
      startAt.setHours(hh, mm, 0, 0);

      const workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null> = {};
      for (const w of workers) {
        workerWindowByWorkerId[w.id] = getWorkerWorkingWindow(w, selectedDate);
      }
      const businessWindow = getBusinessWindow(selectedDate);

      // Multi-booking only: combo is the ONLY source of truth. Require match; no fallback to user order.
      let baseChain: ChainServiceInput[];
      let multiPayload: MultiBookingSelectionPayload | undefined;
      let matchedCombo: typeof multiBookingCombos[0] | null = null;
      if (isMultiBooking && selectedServices.length > 1) {
        const selectedTypeIds = selectedServices.map((s) => s.pricingItem.id).filter((id): id is string => id != null && id !== "");
        const match = findMatchingCombo(multiBookingCombos, selectedTypeIds);
        if (!match) {
          setSubmitError("לא קיימת קומבינציה עבור השירותים שנבחרו. אנא צרו קשר עם העסק להמשך בירור.");
          setIsSubmitting(false);
          return;
        }
        matchedCombo = match;
        const orderedTypeIds = Array.isArray(match.orderedServiceTypeIds) && match.orderedServiceTypeIds.length > 0
          ? match.orderedServiceTypeIds
          : selectedTypeIds;
        {
          const chainInputs: ChainServiceInput[] = [];
          for (let i = 0; i < orderedTypeIds.length; i++) {
            const typeId = orderedTypeIds[i]!;
            const prevTypeId = i > 0 ? orderedTypeIds[i - 1]! : null;
            const prevItem = prevTypeId ? pricingItems.find((p) => p.id === prevTypeId) : null;
            const waitBefore = i > 0 && prevItem
              ? Math.max(0, (prevItem.hasFollowUp && prevItem.followUp) ? (prevItem.followUp.waitMinutes ?? 0) : 0)
              : 0;
            const pricingItem = pricingItems.find((p) => p.id === typeId);
            const service = pricingItem
              ? services.find((s) => s.id === pricingItem.serviceId || s.name === (pricingItem.serviceId || pricingItem.service))
              : null;
            if (pricingItem && service) {
              chainInputs.push({
                service,
                pricingItem,
                ...(i > 0 && { finishGapBefore: waitBefore }),
              });
            } else {
              const fallback = selectedServices.find((s) => s.pricingItem.id === typeId);
              if (fallback) {
                chainInputs.push({
                  service: fallback.service,
                  pricingItem: fallback.pricingItem,
                  ...(i > 0 && { finishGapBefore: waitBefore }),
                });
              }
            }
          }
          if (match.autoSteps?.length) {
          const lastTypeId = orderedTypeIds[orderedTypeIds.length - 1];
          const lastItem = lastTypeId ? pricingItems.find((p) => p.id === lastTypeId) : null;
          let gapBeforeFirstAuto = lastItem && (lastItem.hasFollowUp && lastItem.followUp)
            ? Math.max(0, lastItem.followUp.waitMinutes ?? 0)
            : 0;
          for (const step of match.autoSteps) {
            if (step.position !== "end") continue;
            const service = services.find((s) => s.id === step.serviceId);
            if (!service) continue;
            const syntheticPricing: PricingItem = {
              ...getDefaultPricingItem(service),
              id: `auto-${step.serviceId}-${step.durationMinutesOverride}`,
              durationMinMinutes: step.durationMinutesOverride,
              durationMaxMinutes: step.durationMinutesOverride,
            };
            chainInputs.push({
              service,
              pricingItem: syntheticPricing,
              finishGapBefore: gapBeforeFirstAuto,
            });
            gapBeforeFirstAuto = 0;
          }
        }
          baseChain = chainInputs;
        }
        multiPayload = {
          isMultiBooking: true,
          selectedServiceTypeIds: selectedTypeIds,
          orderedServiceTypeIds: orderedTypeIds,
          multiBookingComboId: match.id,
          ...(match.autoSteps?.length && {
            appliedAutoSteps: match.autoSteps
              .filter((s) => s.position === "end")
              .map((s) => ({ serviceId: s.serviceId, durationMinutesOverride: s.durationMinutesOverride })),
          }),
        };
        } else {
        baseChain = selectedServices.map((s) => ({ service: s.service, pricingItem: s.pricingItem }));
      }
      // When combo matched, use chain as-is (no finishing-service append) so combo order + gaps + auto-step are preserved.
      const chain = (isMultiBooking && selectedServices.length > 1 && matchedCombo)
        ? baseChain
        : buildChainWithFinishingService(baseChain, services, pricingItems);
      const resolved = resolveChainWorkers({
        chain,
        startAt,
        dateStr: bookingDate,
        workers,
        bookingsForDate,
        preferredWorkerId: selectedWorker?.id ?? null,
        workerWindowByWorkerId,
        businessWindow,
      });
      if (!resolved) {
        setSubmitError("אין זמינות להשלמת כל השירותים. נא בחר שעה אחרת.");
        return;
      }
      const repaired = repairInvalidAssignments(resolved, workers, {
        dateStr: bookingDate,
        bookingsForDate,
        workerWindowByWorkerId,
        businessWindow,
      });
      if (!repaired) {
        setSubmitError("אין עובד זמין לאחד השירותים. נא לנסות שעה אחרת.");
        return;
      }
      const validation = validateChainAssignments(repaired, workers);
      if (!validation.valid) {
        setSubmitError(validation.errors[0] ?? "ההקצאה אינה תקינה. נא לנסות שוב.");
        return;
      }
      if (multiPayload && repaired.length > 0) {
        const firstStart = repaired[0]!.startAt.getTime();
        multiPayload.computedOffsetsMinutes = repaired.map((slot) =>
          Math.round((slot.startAt.getTime() - firstStart) / (60 * 1000))
        );
      }
      if (process.env.NODE_ENV !== "production" && multiPayload && matchedCombo && repaired.length > 0) {
        const firstStart = repaired[0]!.startAt.getTime();
        console.log("MULTI COMBO APPLIED", {
          comboId: matchedCombo.id,
          trigger: matchedCombo.triggerServiceTypeIds,
          ordered: matchedCombo.orderedServiceTypeIds,
          autoSteps: matchedCombo.autoSteps,
          computedSteps: repaired.map((s, idx) => ({
            index: idx,
            kind: idx >= (matchedCombo!.orderedServiceTypeIds?.length ?? 0) ? "auto" : "type",
            serviceTypeId: undefined,
            serviceId: s.serviceId,
            serviceName: s.serviceName,
            start: s.startAt.toISOString(),
            end: s.endAt.toISOString(),
            durationMin: s.durationMin,
          })),
        });
      }
      const { firstBookingId, visitGroupId } = await saveMultiServiceBooking(siteId, repaired, {
        name: clientName.trim(),
        phone: clientPhone.trim(),
        note: clientNote.trim() || undefined,
      }, { workers, multiPayload });
      console.log("[BOOK_CREATE] client_write_ok", { siteId, firstBookingId, visitGroupId, bookingPath: `sites/${siteId}/bookings/${firstBookingId}` });
      if (!firstBookingId) {
        setSubmitError("שגיאה: לא התקבל מזהה תור. נא לנסות שוב.");
        return;
      }
      const confirmRes = await fetch("/api/whatsapp/send-booking-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, bookingId: firstBookingId }),
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok || (confirmData && confirmData.ok === false)) {
        const errMsg = (confirmData && typeof confirmData.error === "string") ? confirmData.error : "שליחת אישור נכשלה";
        if (confirmRes.status === 404) {
          setSubmitError("התור לא נמצא במערכת לאחר השמירה. ייתכן ששגיאה בהתחברות לשרת. נא לנסות שוב או ליצור קשר עם המספרה.");
        } else {
          setSubmitError(`שגיאה באישור התור: ${errMsg}. נא ליצור קשר עם המספרה לאימות.`);
        }
        return;
      }
      setPhase2WorkerAssigned(null);
      setStep(6);
    } catch (err) {
      console.error("Failed to save booking", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSubmitError(`שגיאה בשמירת ההזמנה: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get theme colors with defaults
  const theme = config?.themeColors || defaultThemeColors;

  // Generate time slots based on business hours. Break filtering is done in computeAvailableSlots (service segments only; wait gaps may cross breaks).
  const generateTimeSlotsForDate = (durationMin: number = 30): string[] => {
    if (!selectedDate) return [];
    const businessDayConfig = resolveBusinessDayConfig(selectedDate);
    if (!businessDayConfig || !businessDayConfig.enabled) return [];
    const openMin = timeToMinutes(businessDayConfig.start);
    const closeMin = timeToMinutes(businessDayConfig.end);
    const slotIntervalMinutes = 15;
    if (closeMin <= openMin) return [];
    const lastStartMin = closeMin - durationMin;
    if (lastStartMin < openMin) return [];
    const slots: string[] = [];
    let currentTime = openMin;
    while (currentTime <= lastStartMin) {
      slots.push(minutesToTime(currentTime));
      currentTime += slotIntervalMinutes;
    }
    // Do not filter by full-span breaks here: computeAvailableSlots checks only service segments (wait gaps allowed across breaks).
    return slots;
  };

  const availableTimeSlots = useMemo(() => {
    if (!selectedDate || selectedServices.length === 0) return [];
    const dateStr = ymdLocal(selectedDate);
    if (isClosedDate(bookingSettings, dateStr)) return [];
    const workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null> = {};
    for (const w of workers) {
      workerWindowByWorkerId[w.id] = getWorkerWorkingWindow(w, selectedDate);
    }
    const businessWindow = getBusinessWindow(selectedDate);
    const baseChain: ChainServiceInput[] = selectedServices.map((s) => ({ service: s.service, pricingItem: s.pricingItem }));
    const chain = buildChainWithFinishingService(baseChain, services, pricingItems);
    const totalDuration = getChainTotalDuration(chain);
    const candidateTimes = generateTimeSlotsForDate(totalDuration);
    const preferredWorkerId = selectedWorker == null ? null : selectedWorker.id;
    const dayKey = getBookingScheduleDayKey(selectedDate, siteTimezone);
    const breaksForDay = (bookingSettings.days[dayKey] as { breaks?: { start: string; end: string }[] })?.breaks;
    const weekdayKey = jsDayToWeekdayKey(getJsDow(selectedDate, siteTimezone));
    const workerBreaksByWorkerId: Record<string, { start: string; end: string }[] | undefined> = {};
    for (const w of workers) {
      const dayConfig = w.availability?.find((d) => d.day === weekdayKey);
      if (dayConfig?.breaks?.length) workerBreaksByWorkerId[w.id] = dayConfig.breaks;
    }
    const slots = computeAvailableSlots({
      date: selectedDate,
      dateStr,
      chain,
      preferredWorkerId,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
      candidateTimes,
      breaks: breaksForDay,
      workerBreaksByWorkerId,
    });

    // When selected date is today (tenant timezone), hide past time slots.
    const tenantTz = config?.archiveRetention?.timezone;
    const todayStrInTz = tenantTz ? getTodayInTimeZone(tenantTz) : ymdLocal(new Date());
    if (dateStr === todayStrInTz) {
      const now =
        tenantTz ? getNowInTimeZone(tenantTz) : { hours: new Date().getHours(), minutes: new Date().getMinutes() };
      return slots.filter((timeStr) => {
        const [h, m] = timeStr.split(":").map(Number);
        return h > now.hours || (h === now.hours && m > now.minutes);
      });
    }
    return slots;
  }, [
    config,
    selectedDate,
    selectedServices,
    selectedWorker,
    workers,
    bookingsForDate,
    bookingSettings,
  ]);

  useEffect(() => {
    if (!selectedTime) return;
    if (availableTimeSlots.length === 0 || !availableTimeSlots.includes(selectedTime)) {
      setSelectedTime(availableTimeSlots[0] ?? "");
      setTimeUpdatedByWorkerMessage(true);
    }
  }, [selectedWorker, selectedDate, availableTimeSlots, selectedTime]);

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>טוען את עמוד ההזמנה…</p>
      </div>
    );
  }

  const stepLabels = [
    { num: 1, label: "שירות" },
    { num: 2, label: "איש צוות" },
    { num: 3, label: "תאריך" },
    { num: 4, label: "שעה" },
    { num: 5, label: "פרטים" },
  ];

  if (step === 6) {
    // Success screen
    return (
      <div 
        dir="rtl" 
        className="min-h-screen py-8"
        style={{ 
          backgroundColor: "var(--bg)",
          "--bg": theme.background,
          "--surface": theme.surface,
          "--text": theme.text,
          "--muted": theme.mutedText,
          "--primary": theme.primary,
          "--primaryText": theme.primaryText,
          "--accent": theme.accent,
          "--border": theme.border,
        } as React.CSSProperties}
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="rounded-3xl shadow-lg p-6 sm:p-8 text-center" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
            <div className="mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#d1fae5" }}>
                <svg
                  className="w-8 h-8"
                  style={{ color: "#10b981" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--text)" }}>
                ההזמנה נקלטה
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                נחזור אליך בקרוב לאישור התור
              </p>
            </div>

            <div className="rounded-2xl p-6 mb-6 text-right space-y-3" style={{ backgroundColor: "var(--bg)" }}>
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>שירות{selectedServices.length > 1 ? "ים" : ""}:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedServices.length === 1
                    ? selectedService?.name
                    : selectedServices.map((s) => s.pricingItem.type?.trim() ? `${s.service.name} — ${s.pricingItem.type}` : s.service.name).join(" → ")}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>מעצב:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedWorker ? selectedWorker.name : "ללא העדפה"}
                </span>
              </div>
              {phase2WorkerAssigned && (
                <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>המשך טיפול יבוצע על ידי:</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    {phase2WorkerAssigned.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>תאריך:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedDate ? formatDateForDisplay(selectedDate) : ""}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--muted)" }}>שעה:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedTime}
                </span>
              </div>
            </div>

            <Link
              href={getSiteUrl(config?.slug, siteId, "")}
              className="inline-block px-6 py-3 font-semibold rounded-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--primary)", color: "var(--primaryText)" }}
            >
              חזרה לאתר
            </Link>
          </div>
        </div>
      </div>
    );
  }


  // Helper: Check if a worker is available for a time slot
  // This is the single source of truth for worker availability in booking
  const isWorkerAvailableForSlot = (
    worker: { id: string; name: string; availability?: OpeningHours[]; active?: boolean },
    date: Date,
    slotTime: string,
    serviceDurationMinutes: number
  ): { available: boolean; reason?: string } => {
    // Worker must be active
    if (worker.active === false) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Booking] Worker "${worker.name}" (${worker.id}) not available: inactive`);
      }
      return { available: false, reason: "inactive" };
    }

    // If worker has no availability config, assume available (backward compatibility)
    if (!worker.availability || !Array.isArray(worker.availability) || worker.availability.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Booking] Worker "${worker.name}" (${worker.id}) has no availability config, assuming available`);
      }
      return { available: true }; // Backward compatibility: no config = available
    }

    // Resolve worker day config using shared helper
    const workerDayConfig = resolveWorkerDayConfig(worker, date);
    
    if (!workerDayConfig) {
      if (process.env.NODE_ENV !== "production") {
        const dayIndex = getJsDow(date, siteTimezone);
        const weekdayKey = jsDayToWeekdayKey(dayIndex);
        console.log(`[Booking] Worker "${worker.name}" (${worker.id}) has no config for ${weekdayKey} (jsDayIndex=${dayIndex}), not available`);
      }
      return { available: false, reason: "no config for day" };
    }

    // Explicitly check if worker day is closed (marked as not available)
    // Worker day is closed if both open and close are null
    if (!workerDayConfig.open || !workerDayConfig.close) {
      if (process.env.NODE_ENV !== "production") {
        const dayIndex = getJsDow(date, siteTimezone);
        const weekdayKey = jsDayToWeekdayKey(dayIndex);
        console.log(`[Booking] Worker "${worker.name}" (${worker.id}) not available: day ${weekdayKey} is closed (open=${workerDayConfig.open}, close=${workerDayConfig.close})`);
      }
      return { available: false, reason: "day closed" };
    }

    // Check if slot fits within working hours
    const slotStartMinutes = timeToMinutes(slotTime);
    const slotEndMinutes = slotStartMinutes + serviceDurationMinutes;
    
    const isAvailable = isWithinWorkingHours(workerDayConfig, slotStartMinutes, slotEndMinutes);
    
    if (process.env.NODE_ENV !== "production" && !isAvailable) {
      console.log(`[Booking] Worker "${worker.name}" (${worker.id}) not available for slot ${slotTime}:`, {
        weekday: workerDayConfig.day,
        workHours: `${workerDayConfig.open}-${workerDayConfig.close}`,
        slotStart: slotTime,
        slotEnd: minutesToTime(slotEndMinutes),
        slotDuration: serviceDurationMinutes,
        reason: "outside working hours",
      });
    }
    
    return { 
      available: isAvailable, 
      reason: isAvailable ? undefined : "outside working hours" 
    };
  };

  // ============================================================================
  // STEP 2 → STEP 3: Filter dates by business hours (+ worker when one is selected)
  // ============================================================================
  // Date is available (clickable) when:
  // - business is open that weekday per business open hours (Rank 1)
  // - service duration fits in business window
  // - If a worker is selected: that worker must also be available that day
  // - If no worker selected: day is available whenever business is open (time step will show "no times" if no workers)
  const isDateAvailable = (date: Date): boolean => {
    if (selectedServices.length === 0) return false;

    // Rank 0: Disable past dates (in site timezone)
    const tz = siteTimezone || "Asia/Jerusalem";
    const todayStr = getTodayInTimeZone(tz);
    const dateStrForTz = (() => {
      try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const parts = formatter.formatToParts(date);
        const y = parts.find((p) => p.type === "year")?.value ?? "";
        const m = parts.find((p) => p.type === "month")?.value ?? "";
        const d = parts.find((p) => p.type === "day")?.value ?? "";
        return `${y}-${m}-${d}`;
      } catch {
        return ymdLocal(date);
      }
    })();
    if (dateStrForTz < todayStr) return false;

    // Rank 1: Business must be open on this date (from admin business open hours)
    const businessDayConfig = resolveBusinessDayConfig(date);
    if (!businessDayConfig || !businessDayConfig.enabled) {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - business closed`);
      }
      return false;
    }

    const businessWindow = getBusinessWindow(date);
    if (!businessWindow) return false;

    const baseChain: ChainServiceInput[] = selectedServices.map((s) => ({ service: s.service, pricingItem: s.pricingItem }));
    const chainInput = buildChainWithFinishingService(baseChain, services, pricingItems);
    const serviceDurationMinutes = getChainTotalDuration(chainInput);
    const slotIntervalMinutes = 15;

    // Duration must fit in business window for the date to be selectable
    const canFitInBusiness = (businessWindow.endMin - businessWindow.startMin) >= Math.max(slotIntervalMinutes, serviceDurationMinutes);
    if (!canFitInBusiness) {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - duration does not fit in business window`);
      }
      return false;
    }

    // With preferred worker: that worker must work this date and have overlapping window
    if (selectedWorker) {
      const worker = workers.find((w) => w.id === selectedWorker.id);
      if (!worker || !isWorkerWorkingOnDate(worker, date)) {
        if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
          console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - selected worker not available`);
        }
        return false;
      }
      const workerWindow = getWorkerWorkingWindow(worker, date);
      const effectiveStart = workerWindow ? Math.max(businessWindow.startMin, workerWindow.startMin) : businessWindow.startMin;
      const effectiveEnd = workerWindow ? Math.min(businessWindow.endMin, workerWindow.endMin) : businessWindow.endMin;
      if (effectiveEnd <= effectiveStart || (effectiveEnd - effectiveStart) < Math.max(slotIntervalMinutes, serviceDurationMinutes)) {
        if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
          console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - no time window overlap or slot cannot fit`);
        }
        return false;
      }
    }
    // No worker selected: date is available whenever business is open and duration fits (step 4 will show "no times" if no workers)

    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} enabled`);
    }
    return true;
  };

  // Debug info for step 4 (dev only)
  const debugInfo = (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" && selectedDate && selectedService) ? (() => {
    const dayIndex = getJsDow(selectedDate, siteTimezone);
    const dayKey = getBookingScheduleDayKey(selectedDate, siteTimezone);
    const businessDayConfig = resolveBusinessDayConfig(selectedDate);
    const serviceDurationMinutes = selectedPricingItem
      ? selectedPricingItem.durationMaxMinutes || selectedPricingItem.durationMinMinutes || 30
      : 30;
    const generatedSlots = generateTimeSlotsForDate(serviceDurationMinutes);
    const weekdayKey = jsDayToWeekdayKey(dayIndex);
    
    // Worker availability debug info
    const workerAvailabilityInfo = eligibleWorkers.map((worker) => {
      const workerDayConfig = resolveWorkerDayConfig(worker, selectedDate);
      const isDayClosed = workerDayConfig && (!workerDayConfig.open || !workerDayConfig.close);
      return {
        name: worker.name,
        active: worker.active !== false,
        hasAvailability: Array.isArray(worker.availability) && worker.availability.length > 0,
        dayConfig: workerDayConfig ? {
          day: workerDayConfig.day,
          open: workerDayConfig.open,
          close: workerDayConfig.close,
          isClosed: isDayClosed,
        } : "no config",
        dayClosed: isDayClosed,
      };
    });
    
    return {
      selectedDate: ymdLocal(selectedDate),
      dateISO: selectedDate.toISOString(),
      jsDayIndex: dayIndex,
      configDayKey: dayKey,
      weekdayKey,
      businessDayConfig: businessDayConfig ? JSON.stringify(businessDayConfig, null, 2) : "null (disabled or missing)",
      slotMinutes: bookingSettings.slotMinutes,
      serviceDurationMinutes,
      generatedSlotsCount: generatedSlots.length,
      bookingsForDateCount: bookingsForDate.length,
      availableSlotsCount: availableTimeSlots.length,
      workersCount: workers.length,
      eligibleWorkersCount: eligibleWorkers.length,
      workerAvailabilityInfo: JSON.stringify(workerAvailabilityInfo, null, 2),
    };
  })() : null;

  return (
    <div 
      dir="rtl" 
      className="min-h-screen py-6 sm:py-8"
      style={{ 
        backgroundColor: "var(--bg)",
        "--bg": theme.background,
        "--surface": theme.surface,
        "--text": theme.text,
        "--muted": theme.mutedText,
        "--primary": theme.primary,
        "--primaryText": theme.primaryText,
        "--accent": theme.accent,
        "--border": theme.border,
      } as React.CSSProperties}
    >
      <div className="max-w-2xl mx-auto px-4">
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--text)" }}>
              הזמנת תור
            </h1>
            <Link
              href={getSiteUrl(config?.slug, siteId, "")}
              className="text-sm hover:opacity-80 transition-opacity"
              style={{ color: "var(--muted)" }}
            >
              ביטול
            </Link>
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
            {stepLabels.map((s) => (
              <div
                key={s.num}
                className={`flex flex-col items-center ${
                  step === s.num ? "font-semibold" : ""
                }`}
                style={{ color: step === s.num ? "var(--accent)" : "var(--muted)" }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
                  style={{
                    backgroundColor: step === s.num 
                      ? "var(--primary)" 
                      : step > s.num 
                      ? "#10b981" 
                      : "var(--border)",
                    color: step === s.num || step > s.num ? "var(--primaryText)" : "var(--muted)"
                  }}
                >
                  {step > s.num ? "✓" : s.num}
                </div>
                <span className="text-[10px]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="rounded-3xl shadow-lg p-6 sm:p-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
          {/* Step 1: Service and pricing selection (multi-service only when isMultiBooking) */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו שירותים
              </h2>
              <div className="flex items-center justify-end gap-3 mb-3">
                <span className="text-sm" style={{ color: "var(--muted)" }}>הזמנה כפולה (מספר שירותים)</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isMultiBooking}
                  onClick={() => setIsMultiBooking((prev) => !prev)}
                  className="relative w-11 h-6 rounded-full transition-colors"
                  style={{
                    backgroundColor: isMultiBooking ? "var(--primary)" : "var(--border)",
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: isMultiBooking ? "translateX(1.25rem)" : "translateX(0)" }}
                  />
                </button>
              </div>
              {!isMultiBooking && (
                <p className="text-sm text-right mb-3" style={{ color: "var(--muted)" }}>
                  בחרו שירות אחד
                </p>
              )}
              {isMultiBooking && (
                <p className="text-sm text-right mb-3" style={{ color: "var(--muted)" }}>
                  ניתן להוסיף מספר שירותים לאותו ביקור (הראשון שנבחר הוא הראשי)
                </p>
              )}

              {isMultiBooking && selectedServices.length > 1 && !hasValidMultiBookingCombo && (
                <div className="mb-4 p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                  <p className="text-sm" style={{ color: "#991b1b" }}>
                    לא קיימת קומבינציה עבור השירותים שנבחרו. אנא צרו קשר עם העסק להמשך בירור.
                  </p>
                </div>
              )}
              {selectedServices.length > 0 && (
                <div className="mb-4 p-4 rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
                  <p className="text-xs font-medium mb-2 text-right" style={{ color: "var(--muted)" }}>
                    {isMultiBooking ? "השירותים שנבחרו" : "השירות שנבחר"}
                  </p>
                  <ul className="space-y-2">
                    {selectedServices.map((s, idx) => {
                      const dur = s.pricingItem.durationMaxMinutes ?? s.pricingItem.durationMinMinutes ?? 30;
                      const disp = s.pricingItem.type?.trim() ? `${s.service.name} — ${s.pricingItem.type}` : s.service.name;
                      return (
                        <li
                          key={`${s.service.id}-${s.pricingItem.id}-${idx}`}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg"
                          style={{ backgroundColor: "var(--surface)" }}
                        >
                          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {idx + 1}. {disp} ({dur} דק׳)
                          </span>
                          <div className="flex gap-1">
                            {isMultiBooking && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (idx > 0) {
                                      const next = [...selectedServices];
                                      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                                      setSelectedServices(next);
                                    }
                                  }}
                                  disabled={idx === 0}
                                  className="p-1 rounded text-xs disabled:opacity-40"
                                  style={{ color: "var(--muted)" }}
                                  aria-label="למעלה"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (idx < selectedServices.length - 1) {
                                      const next = [...selectedServices];
                                      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                                      setSelectedServices(next);
                                    }
                                  }}
                                  disabled={idx === selectedServices.length - 1}
                                  className="p-1 rounded text-xs disabled:opacity-40"
                                  style={{ color: "var(--muted)" }}
                                  aria-label="למטה"
                                >
                                  ↓
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedServices((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded text-xs"
                              style={{ color: "#dc2626" }}
                              aria-label="הסר"
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {bookableServices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-right mb-2" style={{ color: "var(--muted)" }}>
                    אין אפשרויות הזמנה אונליין זמינות כרגע
                  </p>
                  <p className="text-xs text-right" style={{ color: "var(--muted)" }}>
                    אנא הוסף שירותים ומחירים בעמוד המחירון
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {bookableServices.map((service) => {
                    // Get pricing items for this service, or use default if none exist
                    const servicePricingItems = (() => {
                      const matching = pricingItems.filter((item) => {
                        const itemServiceId = item.serviceId || item.service;
                        return itemServiceId === service.name;
                      });
                      // If no pricing items exist, create a default one (price is optional)
                      if (matching.length === 0) {
                        return [getDefaultPricingItem(service)];
                      }
                      return matching;
                    })();
                    
                    const isExpanded = expandingServiceId === service.id;

                    return (
                      <div key={service.id} className="space-y-3">
                        <button
                          type="button"
                          onClick={() => setExpandingServiceId((prev) => (prev === service.id ? null : service.id))}
                          className="w-full text-right p-4 rounded-2xl border-2 transition-all hover:opacity-90"
                          style={{
                            borderColor: isExpanded ? "var(--primary)" : "var(--border)",
                            backgroundColor: isExpanded ? "var(--bg)" : "var(--surface)",
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-lg" style={{ color: "var(--text)" }}>
                              {service.name}
                            </h3>
                            <span className="text-sm" style={{ color: "var(--muted)" }}>
                              {servicePricingItems.length} אפשרויות
                            </span>
                          </div>
                        </button>
                        
                        {isExpanded && servicePricingItems.length > 0 && (
                          <div className="pr-4 space-y-2">
                            <p className="text-xs text-right mb-2" style={{ color: "var(--muted)" }}>הוסף אפשרות</p>
                            {servicePricingItems.map((item) => {
                              const displayName = item.type && item.type.trim() 
                                ? `${service.name} - ${item.type}`
                                : service.name;
                              const displayPrice = item.priceRangeMin && item.priceRangeMax
                                ? (() => {
                                    const min = Math.min(item.priceRangeMin!, item.priceRangeMax!);
                                    const max = Math.max(item.priceRangeMin!, item.priceRangeMax!);
                                    return (
                                      <span dir="ltr" className="inline-block">
                                        ₪{min}–₪{max}
                                      </span>
                                    );
                                  })()
                                : item.price
                                ? `₪${item.price}`
                                : "מחיר לפי בקשה";
                              const displayDuration = item.durationMinMinutes === item.durationMaxMinutes
                                ? `${item.durationMinMinutes} דק'`
                                : `${item.durationMinMinutes}-${item.durationMaxMinutes} דק'`;
                              
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    if (!isMultiBooking) {
                                      setSelectedServices([{ service, pricingItem: item }]);
                                    } else {
                                      setSelectedServices((prev) => [...prev, { service, pricingItem: item }]);
                                    }
                                    setExpandingServiceId(null);
                                  }}
                                  className="w-full text-right p-3 rounded-xl border transition-all hover:opacity-90"
                                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="text-right">
                                      <h4 className="font-medium mb-1" style={{ color: "var(--text)" }}>
                                        {displayName}
                                      </h4>
                                      <div className="flex gap-3 text-xs" style={{ color: "var(--muted)" }}>
                                        {typeof displayPrice === "string" ? <span>{displayPrice}</span> : displayPrice}
                                        <span>•</span>
                                        <span>{displayDuration}</span>
                                      </div>
                                    </div>
                                    <span className="text-lg" style={{ color: "var(--primary)" }}>+</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Worker selection */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו איש צוות
              </h2>
              <p className="text-sm mb-3 text-right" style={{ color: "var(--muted)" }}>
                (אופציונלי - ניתן לדלג)
              </p>
              <div className="space-y-3">
                {workersLoading ? (
                  <p className="text-sm text-right" style={{ color: "var(--muted)" }}>טוען עובדים…</p>
                ) : workersError ? (
                  <div className="p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                    <p className="text-sm" style={{ color: "#991b1b" }}>{workersError}</p>
                  </div>
                ) : eligibleWorkers.length === 0 ? (
                  <div className="p-4 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                    <p className="text-sm font-semibold mb-2" style={{ color: "#991b1b" }}>
                      אין עובדים שמבצעים את השירות הזה
                    </p>
                    <p className="text-xs" style={{ color: "#991b1b" }}>
                      אנא פנה למנהל המערכת כדי להגדיר עובדים {selectedServices.length === 1 ? `לשירות "${selectedService?.name}"` : "לשירותים אלה"}
                    </p>
                    {workerEligibilityDebug && (
                      <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200 text-left text-xs font-mono" dir="ltr">
                        <div>Workers loaded: {workerEligibilityDebug.workersLoaded}</div>
                        <div>Workers eligible: {workerEligibilityDebug.workersEligible}</div>
                        <div>Service key used: {workerEligibilityDebug.serviceKeyUsed}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* "No preference" option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWorker(null);
                        setTimeUpdatedByWorkerMessage(false);
                      }}
                      className="w-full text-right p-4 rounded-2xl border-2 transition-all hover:opacity-90"
                      style={{
                        borderColor: selectedWorker === null ? "var(--primary)" : "var(--border)",
                        backgroundColor: selectedWorker === null ? "var(--bg)" : "var(--surface)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style={{ backgroundColor: "var(--border)", color: "var(--text)" }}>
                          ?
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                            ללא העדפה
                          </h3>
                          <p className="text-xs" style={{ color: "var(--muted)" }}>
                            כל עובד זמין
                          </p>
                        </div>
                      </div>
                    </button>
                    {/* Eligible workers */}
                    {eligibleWorkers.map((worker) => (
                      <button
                        key={worker.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorker({ id: worker.id, name: worker.name });
                          setTimeUpdatedByWorkerMessage(false);
                        }}
                        className="w-full text-right p-4 rounded-2xl border-2 transition-all hover:opacity-90"
                        style={{
                          borderColor: selectedWorker?.id === worker.id ? "var(--primary)" : "var(--border)",
                          backgroundColor: selectedWorker?.id === worker.id ? "var(--bg)" : "var(--surface)",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style={{ backgroundColor: "var(--border)", color: "var(--text)" }}>
                            {worker.name[0]}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                              {worker.name}
                            </h3>
                            {worker.role && (
                              <p className="text-xs" style={{ color: "var(--muted)" }}>{worker.role}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    {/* No phase 2 worker picker — phase 2 is auto-assigned at booking time */}
                  </>
                )}
                {ineligibleWorkerMessage && (
                  <p className="text-sm mt-2" style={{ color: "var(--primary)" }}>
                    העובד שנבחר לא מבצע את השירות הזה
                  </p>
                )}
                {workerEligibilityDebug && eligibleWorkers.length > 0 && (
                  <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200 text-left text-xs font-mono" dir="ltr">
                    <div>Workers loaded: {workerEligibilityDebug.workersLoaded}</div>
                    <div>Workers eligible: {workerEligibilityDebug.workersEligible}</div>
                    <div>Service key used: {workerEligibilityDebug.serviceKeyUsed}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Date selection */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו תאריך
              </h2>
              
              {/* Navigation controls */}
              <div className="flex items-center justify-between mb-4 gap-4">
                <button
                  type="button"
                  onClick={handleNextDateWindow}
                  className="px-4 py-2 rounded-lg border-2 transition-all hover:opacity-90 font-medium text-sm flex items-center gap-2"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  <span>הבא</span>
                  <span style={{ transform: "scaleX(-1)" }}>→</span>
                </button>
                
                <div className="text-sm flex-1 text-center" style={{ color: "var(--muted)" }}>
                  {(() => {
                    const endDate = new Date(dateWindowStart);
                    endDate.setDate(dateWindowStart.getDate() + DATE_WINDOW_SIZE - 1);
                    const startMonth = dateWindowStart.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
                    const endMonth = endDate.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
                    if (startMonth === endMonth) {
                      return startMonth;
                    }
                    return `${startMonth} - ${endMonth}`;
                  })()}
                </div>
                
                <button
                  type="button"
                  onClick={handlePrevDateWindow}
                  disabled={!canNavigateBackward()}
                  className="px-4 py-2 rounded-lg border-2 transition-all hover:opacity-90 font-medium text-sm disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
                  style={{
                    borderColor: canNavigateBackward() ? "var(--border)" : "var(--border)",
                    backgroundColor: canNavigateBackward() ? "var(--surface)" : "var(--bg)",
                    color: canNavigateBackward() ? "var(--text)" : "var(--muted)",
                  }}
                >
                  <span style={{ transform: "scaleX(-1)" }}>←</span>
                  <span>הקודם</span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableDates.map((date) => {
                  const available = isDateAvailable(date);
                  const isSelected =
                    selectedDate &&
                    ymdLocal(selectedDate) === ymdLocal(date);

                  return (
                    <button
                      key={ymdLocal(date)}
                      type="button"
                      onClick={() => {
                        if (available) {
                          setSelectedDate(date);
                          setTimeUpdatedByWorkerMessage(false);
                        }
                      }}
                      disabled={!available}
                      className="p-3 rounded-xl border-2 text-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        borderColor: isSelected ? "var(--primary)" : available ? "var(--border)" : "var(--border)",
                        backgroundColor: isSelected ? "var(--bg)" : available ? "var(--surface)" : "var(--bg)",
                        color: isSelected ? "var(--text)" : available ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      <div className="font-semibold mb-1">
                        {formatDateShort(date)}
                      </div>
                      <div className="text-xs">
                        {date.toLocaleDateString("he-IL", { weekday: "short" })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Time selection */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו שעה
              </h2>
              {selectedDate && (
                <p className="text-sm mb-4 text-right" style={{ color: "var(--muted)" }}>
                  {formatDateForDisplay(selectedDate)}
                </p>
              )}
              
              {/* Debug panel (dev only - requires NEXT_PUBLIC_DEBUG_BOOKING=true) */}
              {process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" && debugInfo && (
                <div className="mb-4 p-4 rounded-lg border text-right text-xs font-mono" style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }}>
                  <div className="space-y-1" style={{ color: "var(--text)" }}>
                    <div className="mb-2"><strong>Debug Info (Dev Only):</strong></div>
                    <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--text)" }}>
                      {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Check for invalid hours */}
              {selectedDate && (() => {
                const dayKey = getBookingScheduleDayKey(selectedDate, siteTimezone);
                const dayConfig = bookingSettings.days[dayKey];
                if (dayConfig && dayConfig.enabled) {
                  const startMin = timeToMinutes(dayConfig.start);
                  const endMin = timeToMinutes(dayConfig.end);
                  if (endMin <= startMin) {
                    return (
                      <div className="p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                        <p className="text-sm" style={{ color: "#991b1b" }}>שעות פעילות לא תקינות</p>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {timeUpdatedByWorkerMessage && (
                <p className="text-sm text-right" style={{ color: "var(--muted)" }}>
                  שעת התחלה עודכנה לפי העובד שנבחר
                </p>
              )}
              {availableTimeSlots.length === 0 ? (
                <p className="text-sm text-right" style={{ color: "var(--muted)" }}>
                  {selectedDate
                    ? (() => {
                        const tz = config?.archiveRetention?.timezone;
                        const todayStr = tz ? getTodayInTimeZone(tz) : ymdLocal(new Date());
                        return ymdLocal(selectedDate) === todayStr
                          ? "אין שעות פנויות להיום"
                          : selectedWorker != null
                            ? "אין שעות זמינות לעובד שנבחר"
                            : "אין שעות זמינות לתאריך זה";
                      })()
                    : (selectedWorker != null ? "אין שעות זמינות לעובד שנבחר" : "אין שעות זמינות לתאריך זה")}
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {availableTimeSlots.map((time) => {
                    const isSelected = selectedTime === time;

                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => {
                          setSelectedTime(time);
                          setTimeUpdatedByWorkerMessage(false);
                        }}
                        className="p-3 rounded-xl border-2 text-sm font-medium transition-all hover:opacity-90"
                        style={{
                          borderColor: isSelected ? "var(--primary)" : "var(--border)",
                          backgroundColor: isSelected ? "var(--bg)" : "var(--surface)",
                          color: "var(--text)",
                        }}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Client details */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                פרטי לקוח
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="clientName"
                    className="block text-sm font-medium mb-2 text-right"
                    style={{ color: "var(--text)" }}
                  >
                    שם מלא *
                  </label>
                  <input
                    type="text"
                    id="clientName"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-xl border px-4 py-3 text-right focus:outline-none focus:ring-2"
                    style={{ 
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 2px rgba(0, 0, 0, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.boxShadow = "none";
                    }}
                    placeholder="הזינו את שמכם המלא"
                  />
                </div>

                <div>
                  <label
                    htmlFor="clientPhone"
                    className="block text-sm font-medium mb-2 text-right"
                    style={{ color: "var(--text)" }}
                  >
                    טלפון *
                  </label>
                  <input
                    type="tel"
                    id="clientPhone"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full rounded-xl border px-4 py-3 text-right focus:outline-none focus:ring-2"
                    style={{ 
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 2px rgba(0, 0, 0, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.boxShadow = "none";
                    }}
                    placeholder="050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="clientNote"
                    className="block text-sm font-medium mb-2 text-right"
                    style={{ color: "var(--text)" }}
                  >
                    הערה (אופציונלי)
                  </label>
                  <textarea
                    id="clientNote"
                    value={clientNote}
                    onChange={(e) => setClientNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border px-4 py-3 text-right focus:outline-none focus:ring-2 resize-none"
                    style={{ 
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 2px rgba(0, 0, 0, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.boxShadow = "none";
                    }}
                    placeholder="השאירו הערות או בקשות מיוחדות..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 pt-6 border-t flex justify-between gap-4" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="px-6 py-3 border rounded-xl font-medium transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                borderColor: "var(--border)",
                color: "var(--text)",
                backgroundColor: "transparent",
              }}
            >
              חזור
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStepValid()}
                className="px-6 py-3 rounded-xl font-semibold transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: "var(--primary)",
                  color: "var(--primaryText)",
                }}
              >
                המשך
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isStepValid() || isSubmitting}
                className="px-6 py-3 rounded-xl font-semibold transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: "#10b981",
                  color: "var(--primaryText)",
                }}
              >
                {isSubmitting ? "שומר…" : "אשר הזמנה"}
              </button>
            )}
          </div>

          {submitError && (
            <div className="mt-4 p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
              <p className="text-sm" style={{ color: "#991b1b" }}>{submitError}</p>
            </div>
          )}

          {!isStepValid() && step < 6 && (
            <div className="mt-4 p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
              <p className="text-sm" style={{ color: "#991b1b" }}>
                יש למלא את כל השדות הנדרשים לפני המשך
              </p>
            </div>
          )}
        </div>
        
        {/* Debug info (dev only - requires NEXT_PUBLIC_DEBUG_BOOKING=true) */}
        {process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" && (
          <div className="mt-4 p-2 bg-slate-100 rounded text-xs text-slate-600 text-right">
            siteId: {siteId}
          </div>
        )}
      </div>
    </div>
  );
}

