"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebaseClient";
import { doc, getDoc, onSnapshot, query, where, getDocs, orderBy } from "firebase/firestore";
import { collection } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { saveBooking } from "@/lib/booking";
import { bookingsCollection, bookingSettingsDoc } from "@/lib/firestorePaths";
import {
  formatDateForDisplay,
  formatDateShort,
} from "@/lib/timeSlots";
import { ymdLocal } from "@/lib/dateLocal";
import { bookingEnabled } from "@/lib/bookingEnabled";
import { useRouter } from "next/navigation";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import {
  subscribeBookingSettings,
  ensureBookingSettings,
} from "@/lib/firestoreBookingSettings";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import { defaultThemeColors } from "@/types/siteConfig";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import type { SiteService } from "@/types/siteConfig";
import { subscribePricingItems } from "@/lib/firestorePricing";
import type { PricingItem } from "@/types/pricingItem";
import type { OpeningHours } from "@/types/booking";

type BookingStep = 1 | 2 | 3 | 4 | 5 | 6; // 6 = success

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
  
  // Bookings for filtering
  const [bookingsForDate, setBookingsForDate] = useState<Array<{ workerId: string | null; time: string; status: string }>>([]);

  // Booking form state
  const [selectedService, setSelectedService] = useState<SiteService | null>(null);
  const [selectedPricingItem, setSelectedPricingItem] = useState<PricingItem | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<{ id: string; name: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
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

  // Helper: Get JavaScript weekday index (0=Sunday, 6=Saturday)
  function getJsWeekday(date: Date): number {
    return date.getDay(); // JavaScript: 0=Sunday, 6=Saturday
  }

  // Helper: Convert JavaScript day index (0=Sunday, 6=Saturday) to weekday key for worker availability
  function getWeekdayKey(dayIndex: number): "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" {
    const mapping: Record<number, "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"> = {
      0: "sun",
      1: "mon",
      2: "tue",
      3: "wed",
      4: "thu",
      5: "fri",
      6: "sat",
    };
    return mapping[dayIndex] || "sun";
  }

  // Helper: Get weekday key for BookingSettings format ("0"=Sunday, "6"=Saturday)
  function getBookingWeekdayKey(date: Date): "0" | "1" | "2" | "3" | "4" | "5" | "6" {
    const dayIndex = getJsWeekday(date);
    return String(dayIndex) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
  }

  // Shared helper: Resolve business day config for a date
  // Returns the day configuration (enabled, start, end) for the given date from BookingSettings
  function resolveBusinessDayConfig(date: Date): { enabled: boolean; start: string; end: string } | null {
    const dayKey = getBookingWeekdayKey(date);
    const dayConfig = bookingSettings.days[dayKey];
    
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] resolveBusinessDayConfig:`, {
        date: ymdLocal(date),
        jsDayIndex: getJsWeekday(date),
        configDayKey: dayKey,
        dayConfig: dayConfig ? {
          enabled: dayConfig.enabled,
          start: dayConfig.start,
          end: dayConfig.end,
        } : null,
      });
    }
    
    return dayConfig || null;
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

    const dayIndex = getJsWeekday(date);
    const weekdayKey = getWeekdayKey(dayIndex);
    
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

  // Filter 1: Check if worker can perform a service
  function workerCanDoService(
    worker: { services?: string[]; active?: boolean },
    serviceId: string
  ): boolean {
    // Worker must be active
    if (worker.active === false) {
      return false;
    }

    // If worker has no services assigned, they are available for ALL services (backward compatibility)
    if (!Array.isArray(worker.services) || worker.services.length === 0) {
      return true;
    }

    // Worker must be assigned to this service
    return worker.services.includes(serviceId);
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
  function getWorkerWorkingWindow(
    worker: { availability?: OpeningHours[] },
    date: Date
  ): { startMin: number; endMin: number } | null {
    const workerDayConfig = resolveWorkerDayConfig(worker, date);
    if (!workerDayConfig || !workerDayConfig.open || !workerDayConfig.close) {
      return null; // Worker day is closed or no config
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

  // Filter 6: Check if slot conflicts with existing bookings
  function doesSlotConflictWithBookings(
    slotStartMinutes: number,
    slotEndMinutes: number,
    workerId: string,
    bookingsForDate: Array<{ workerId: string | null; time: string; status: string }>
  ): boolean {
    return bookingsForDate.some((booking) => {
      // Only check confirmed bookings
      if (booking.status !== "confirmed") {
        return false;
      }

      // Only check bookings for this worker
      if (booking.workerId !== workerId) {
        return false;
      }

      // Check time overlap
      const bookingStartMinutes = timeToMinutes(booking.time);
      // Assume booking duration is at least 30 minutes (or use service duration if available)
      const bookingEndMinutes = bookingStartMinutes + 30; // Default duration

      // Check if slots overlap
      return !(slotEndMinutes <= bookingStartMinutes || slotStartMinutes >= bookingEndMinutes);
    });
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

  // Load booking settings and workers (only if booking is enabled)
  useEffect(() => {
    if (!siteId || !db || typeof window === "undefined") return;
    if (!config || !bookingEnabled(config)) {
      setLoading(false);
      return;
    }

    // Ensure booking settings exist
    ensureBookingSettings(siteId).catch((e) => {
      console.error("Failed to ensure booking settings", e);
    });

    // Load booking settings from Firestore
    const settingsUnsubscribe = subscribeBookingSettings(
      siteId,
      (settings) => {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Booking] Loaded booking settings from Firestore for site ${siteId}:`, {
            slotMinutes: settings.slotMinutes,
            days: Object.entries(settings.days).map(([key, day]) => ({
              dayKey: key,
              enabled: day.enabled,
              hours: `${day.start}-${day.end}`,
            })),
          });
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
            })) as OpeningHours[];
          }
          
          // Include worker (active is true or undefined, which defaults to true)
          workersList.push({
            id: docSnap.id,
            name: data.name || "",
            role: data.role,
            services: data.services || [], // Include services array (empty = available for all services)
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
  }, [siteId, config]);

  // Load bookings for selected date
  useEffect(() => {
    if (!db || !siteId || !selectedDate) {
      setBookingsForDate([]);
      return;
    }

    const dateStr = ymdLocal(selectedDate);
    const q = query(
      bookingsCollection(siteId),
      where("date", "==", dateStr),
      where("status", "==", "confirmed")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bookings: Array<{ workerId: string | null; time: string; status: string }> = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          bookings.push({
            workerId: data.workerId || null,
            time: data.time || "",
            status: data.status || "confirmed",
          });
        });
        setBookingsForDate(bookings);
      },
      (err) => {
        console.error("Failed to load bookings for date", err);
        setBookingsForDate([]);
      }
    );

    return () => unsubscribe();
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
      durationMinMinutes: 30, // Default duration
      durationMaxMinutes: 30,
      price: undefined, // No price - will display "מחיר לפי בקשה"
      priceRangeMin: undefined,
      priceRangeMax: undefined,
      notes: undefined,
      hasFollowUp: false,
      followUpServiceId: null,
      followUpDurationMinutes: null,
      followUpWaitMinutes: null,
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
  // STEP 1 → STEP 2: Filter workers by service assignment (Rank 3)
  // ============================================================================
  // After selecting a service, show ONLY workers who:
  // - are active/enabled
  // - are assigned to this service (or have no assignment = available for all)
  const eligibleWorkers = (() => {
    if (!selectedService) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Booking] Step 1→2: No service selected, no eligible workers");
      }
      return [];
    }
    const serviceId = selectedService.name; // Service name is the ID
    
    const filtered = workers.filter((worker) => {
      const canDo = workerCanDoService(worker, serviceId);
      if (process.env.NODE_ENV !== "production") {
        if (canDo) {
          console.log(`[Booking] Step 1→2: Worker "${worker.name}" CAN do service "${serviceId}"`);
        } else {
          console.log(`[Booking] Step 1→2: Worker "${worker.name}" CANNOT do service "${serviceId}" (active=${worker.active}, services=${JSON.stringify(worker.services)})`);
        }
      }
      return canDo;
    });
    
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Booking] Step 1→2: Service "${serviceId}" - Total workers: ${workers.length}, Eligible: ${filtered.length}`);
      if (filtered.length === 0 && workers.length > 0) {
        console.warn(`[Booking] Step 1→2: No eligible workers found. Workers:`, workers.map(w => ({ 
          name: w.name, 
          active: w.active,
          hasServices: Array.isArray(w.services) && w.services.length > 0,
          services: w.services || []
        })));
      }
    }
    return filtered;
  })();

  // Reset worker and pricing item selection when service changes
  useEffect(() => {
    if (selectedService) {
      // Reset pricing item if it doesn't belong to the selected service
      if (selectedPricingItem) {
        const itemServiceId = selectedPricingItem.serviceId || selectedPricingItem.service;
        if (itemServiceId !== selectedService.name) {
          setSelectedPricingItem(null);
        }
      }
      // Reset worker if not eligible
      if (selectedWorker) {
        const isEligible = eligibleWorkers.some((w) => w.id === selectedWorker.id);
        if (!isEligible) {
          console.log("[Booking] Current worker not eligible for service, resetting selection");
          setSelectedWorker(null);
        }
      }
    } else {
      // Reset both if service is deselected
      setSelectedPricingItem(null);
    }
  }, [selectedService, eligibleWorkers, selectedWorker, selectedPricingItem]);

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

  // Debug: Log worker availability when date is selected (dev only)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" && selectedDate && selectedService) {
      const dayIndex = selectedDate.getDay();
      const weekdayKey = getWeekdayKey(dayIndex);
      
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

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        // Service and pricing item must be selected
        return selectedService !== null && selectedPricingItem !== null;
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
    if (!isStepValid() || !selectedService || !selectedPricingItem || !selectedDate || !selectedTime) {
      return;
    }

    if (!db) {
      setSubmitError("Firebase לא מאותחל. אנא רענן את הדף.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const bookingDate = ymdLocal(selectedDate);
      console.log("[BookingSubmit] date:", bookingDate, "time:", selectedTime);
      
      await saveBooking(
        siteId,
        {
          serviceId: selectedService.name, // Use service name as ID
          serviceName: selectedService.name,
          serviceType: selectedPricingItem.type || null, // Include type if selected
          pricingItemId: selectedPricingItem.id || null, // Include pricing item ID
          workerId: selectedWorker?.id || null,
          workerName: selectedWorker?.name || null,
          date: bookingDate,
          time: selectedTime,
          name: clientName.trim(),
          phone: clientPhone.trim(),
          note: clientNote.trim() || undefined,
          createdAt: new Date().toISOString(),
        },
        selectedPricingItem // Pass pricing item for duration calculation
      );
      setStep(6); // Show success
    } catch (err) {
      console.error("Failed to save booking", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSubmitError(`שגיאה בשמירת ההזמנה: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if booking is enabled
  useEffect(() => {
    if (config && !bookingEnabled(config)) {
      router.replace(`/site/${siteId}`);
    }
  }, [config, siteId, router]);

  // Get theme colors with defaults
  const theme = config?.themeColors || defaultThemeColors;

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>טוען את עמוד ההזמנה…</p>
      </div>
    );
  }

  // Show disabled message if booking is not enabled
  if (!bookingEnabled(config)) {
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
            <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
              הזמנות אונליין לא פעילות
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              באתר הזה לא הופעלה אפשרות הזמנות אונליין.
            </p>
            <Link
              href={`/site/${siteId}`}
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
                <span className="text-sm" style={{ color: "var(--muted)" }}>שירות:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedService?.name}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>מעצב:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedWorker?.name}
                </span>
              </div>
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
              href={`/site/${siteId}`}
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
        const dayIndex = date.getDay();
        const weekdayKey = getWeekdayKey(dayIndex);
        console.log(`[Booking] Worker "${worker.name}" (${worker.id}) has no config for ${weekdayKey} (jsDayIndex=${dayIndex}), not available`);
      }
      return { available: false, reason: "no config for day" };
    }

    // Explicitly check if worker day is closed (marked as not available)
    // Worker day is closed if both open and close are null
    if (!workerDayConfig.open || !workerDayConfig.close) {
      if (process.env.NODE_ENV !== "production") {
        const dayIndex = date.getDay();
        const weekdayKey = getWeekdayKey(dayIndex);
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
  // STEP 2 → STEP 3: Filter dates by business hours + worker availability + available slots
  // ============================================================================
  // After selecting a worker, show ONLY dates where:
  // - business is open that weekday (Rank 1)
  // - worker is available that weekday (Rank 2)
  // - there exists at least one available time slot on that date
  const isDateAvailable = (date: Date): boolean => {
    // Must have selected worker
    if (!selectedWorker) {
      return false;
    }

    // Find the worker object
    const worker = workers.find(w => w.id === selectedWorker.id);
    if (!worker) {
      return false;
    }

    // Rank 1: Business must be open on this date
    const businessDayConfig = resolveBusinessDayConfig(date);
    if (!businessDayConfig || !businessDayConfig.enabled) {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - business closed`);
      }
      return false;
    }

    // Rank 2: Worker must be working on this date
    if (!isWorkerWorkingOnDate(worker, date)) {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - worker not available`);
      }
      return false;
    }

    // Check if there's at least one available time slot on this date
    // (This will be computed in Step 3→4, but we need to verify slots exist)
    const businessWindow = getBusinessWindow(date);
    const workerWindow = getWorkerWorkingWindow(worker, date);
    
    if (!businessWindow) {
      return false; // Business closed
    }

    // If worker has no config, use business window only
    const effectiveStart = workerWindow ? Math.max(businessWindow.startMin, workerWindow.startMin) : businessWindow.startMin;
    const effectiveEnd = workerWindow ? Math.min(businessWindow.endMin, workerWindow.endMin) : businessWindow.endMin;

    if (effectiveEnd <= effectiveStart) {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - no time window overlap`);
      }
      return false; // No overlap
    }

    // Check if at least one slot can fit (using default service duration if not selected yet)
    const serviceDurationMinutes = selectedPricingItem
      ? selectedPricingItem.durationMaxMinutes || selectedPricingItem.durationMinMinutes || 30
      : 30;
    const slotSize = bookingSettings.slotMinutes;
    
    // At least one slot must fit
    const canFitSlot = (effectiveEnd - effectiveStart) >= Math.max(slotSize, serviceDurationMinutes);
    
    if (!canFitSlot) {
      if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} disabled - no slots can fit (window=${effectiveEnd - effectiveStart}min, need=${Math.max(slotSize, serviceDurationMinutes)}min)`);
      }
      return false;
    }

    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] Step 2→3: Date ${ymdLocal(date)} enabled - business open, worker available, slots can fit`);
    }

    return true;
  };

  // ============================================================================
  // STEP 3 → STEP 4: Filter time slots by business hours + worker hours + duration + conflicts
  // ============================================================================
  // After selecting a date, show ONLY time slots where:
  // - within business open hours for that date (Rank 1)
  // - within worker hours for that date (Rank 2)
  // - slot duration fits fully (service duration)
  // - does not conflict with existing bookings for that worker (Rank 4)
  
  // Generate time slots based on business hours (Rank 1)
  const generateTimeSlotsForDate = (): string[] => {
    if (!selectedDate) return [];

    const businessDayConfig = resolveBusinessDayConfig(selectedDate);

    if (!businessDayConfig || !businessDayConfig.enabled) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Booking] Step 3→4: generateTimeSlotsForDate - Day is disabled or missing config for date ${ymdLocal(selectedDate)}`);
      }
      return [];
    }

    const startMin = timeToMinutes(businessDayConfig.start);
    const endMin = timeToMinutes(businessDayConfig.end);
    const slotSize = bookingSettings.slotMinutes;

    // Validate hours
    if (endMin <= startMin) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[Booking] Step 3→4: Invalid hours for date ${ymdLocal(selectedDate)}: ${businessDayConfig.start}-${businessDayConfig.end}`);
      }
      return [];
    }

    // Generate slots
    const slots: string[] = [];
    let currentTime = startMin;

    while (currentTime + slotSize <= endMin) {
      slots.push(minutesToTime(currentTime));
      currentTime += slotSize;
    }

    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] Step 3→4: Generated ${slots.length} slots for date ${ymdLocal(selectedDate)} (business hours: ${businessDayConfig.start}-${businessDayConfig.end})`);
    }

    return slots;
  };

  // Filter time slots using the availability hierarchy
  const availableTimeSlots = (() => {
    if (!selectedDate || !selectedService || !selectedWorker) return [];

    const generatedSlots = generateTimeSlotsForDate();
    
    // Get service duration from selected pricing item (or default)
    const serviceDurationMinutes = selectedPricingItem
      ? selectedPricingItem.durationMaxMinutes || selectedPricingItem.durationMinMinutes || 30
      : 30; // Default 30 minutes if no pricing item selected
    
    // Find the selected worker object
    const worker = workers.find(w => w.id === selectedWorker.id);
    if (!worker) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[Booking] Step 3→4: Selected worker ${selectedWorker.id} not found`);
      }
      return [];
    }

    // Get windows for filtering
    const businessWindow = getBusinessWindow(selectedDate);
    const workerWindow = getWorkerWorkingWindow(worker, selectedDate);

    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] Step 3→4: Filtering slots for date ${ymdLocal(selectedDate)}, worker "${worker.name}"`, {
        generatedSlots: generatedSlots.length,
        businessWindow: businessWindow ? `${minutesToTime(businessWindow.startMin)}-${minutesToTime(businessWindow.endMin)}` : "closed",
        workerWindow: workerWindow ? `${minutesToTime(workerWindow.startMin)}-${minutesToTime(workerWindow.endMin)}` : "no config",
        serviceDurationMinutes,
      });
    }

    // Filter slots using the hierarchy
    let filteredByBusiness = 0;
    let filteredByWorker = 0;
    let filteredByConflicts = 0;

    const availableSlots = generatedSlots.filter((time) => {
      const slotStartMinutes = timeToMinutes(time);
      const slotEndMinutes = slotStartMinutes + serviceDurationMinutes;

      // Rank 1 + Rank 2: Check if slot fits within business and worker windows
      if (!isSlotWithinWindows(slotStartMinutes, slotEndMinutes, businessWindow, workerWindow)) {
        if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
          if (!businessWindow) {
            filteredByBusiness++;
          } else if (!workerWindow || slotStartMinutes < Math.max(businessWindow.startMin, workerWindow.startMin) || slotEndMinutes > Math.min(businessWindow.endMin, workerWindow.endMin)) {
            filteredByWorker++;
          }
        }
        return false;
      }

      // Rank 4: Check for booking conflicts
      if (doesSlotConflictWithBookings(slotStartMinutes, slotEndMinutes, worker.id, bookingsForDate)) {
        if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
          filteredByConflicts++;
        }
        return false;
      }

      return true;
    });

    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(`[Booking] Step 3→4: Slot filtering results:`, {
        generated: generatedSlots.length,
        filteredByBusiness,
        filteredByWorker,
        filteredByConflicts,
        available: availableSlots.length,
      });
    }

    return availableSlots;
  })();


  // Debug info for step 4 (dev only)
  const debugInfo = (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" && selectedDate && selectedService) ? (() => {
    const dayIndex = getJsWeekday(selectedDate);
    const dayKey = getBookingWeekdayKey(selectedDate);
    const businessDayConfig = resolveBusinessDayConfig(selectedDate);
    const generatedSlots = generateTimeSlotsForDate();
    const weekdayKey = getWeekdayKey(dayIndex);
    const serviceDurationMinutes = selectedPricingItem
      ? selectedPricingItem.durationMaxMinutes || selectedPricingItem.durationMinMinutes || 30
      : 30;
    
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
              href={`/site/${siteId}`}
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
          {/* Step 1: Service and pricing selection */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו שירות ואפשרות מחיר
              </h2>
              
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
                    
                    const isServiceSelected = selectedService?.id === service.id;
                    
                    return (
                      <div key={service.id} className="space-y-3">
                        {/* Service Header */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isServiceSelected) {
                              setSelectedService(null);
                              setSelectedPricingItem(null);
                            } else {
                              setSelectedService(service);
                              setSelectedPricingItem(null);
                            }
                          }}
                          className="w-full text-right p-4 rounded-2xl border-2 transition-all hover:opacity-90"
                          style={{
                            borderColor: isServiceSelected ? "var(--primary)" : "var(--border)",
                            backgroundColor: isServiceSelected ? "var(--bg)" : "var(--surface)",
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
                        
                        {/* Pricing Options for this service */}
                        {isServiceSelected && servicePricingItems.length > 0 && (
                          <div className="pr-4 space-y-2">
                            {servicePricingItems.map((item) => {
                              const isSelected = selectedPricingItem?.id === item.id;
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
                                  onClick={() => setSelectedPricingItem(item)}
                                  className="w-full text-right p-3 rounded-xl border transition-all hover:opacity-90"
                                  style={{
                                    borderColor: isSelected ? "var(--primary)" : "var(--border)",
                                    backgroundColor: isSelected ? "var(--bg)" : "var(--surface)",
                                  }}
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
                                    {isSelected && (
                                      <span className="text-lg">✓</span>
                                    )}
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
                      אין עובדים זמינים לשירות זה
                    </p>
                    <p className="text-xs" style={{ color: "#991b1b" }}>
                      אנא פנה למנהל המערכת כדי להגדיר עובדים לשירות "{selectedService?.name}"
                    </p>
                  </div>
                ) : (
                  <>
                    {/* "No preference" option */}
                    <button
                      type="button"
                      onClick={() => setSelectedWorker(null)}
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
                        onClick={() =>
                          setSelectedWorker({ id: worker.id, name: worker.name })
                        }
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
                  </>
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
                      onClick={() => available && setSelectedDate(date)}
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
                    <div><strong>selectedDate:</strong> {debugInfo.selectedDate}</div>
                    <div><strong>dayIndex:</strong> {debugInfo.dayIndex}</div>
                    <div><strong>dayKey:</strong> "{debugInfo.dayKey}"</div>
                    <div><strong>dayConfig:</strong> <pre className="whitespace-pre-wrap">{debugInfo.dayConfig}</pre></div>
                    <div><strong>slotMinutes:</strong> {debugInfo.slotMinutes}</div>
                    <div><strong>generatedSlots count:</strong> {debugInfo.generatedSlotsCount}</div>
                    <div><strong>bookingsForDate count:</strong> {debugInfo.bookingsForDateCount}</div>
                    <div><strong>availableSlots count:</strong> {debugInfo.availableSlotsCount}</div>
                    <div><strong>workers count:</strong> {debugInfo.workersCount}</div>
                    <div><strong>eligibleWorkers count:</strong> {debugInfo.eligibleWorkersCount}</div>
                    <div><strong>serviceDurationMinutes:</strong> {debugInfo.serviceDurationMinutes}</div>
                    <div><strong>weekdayKey:</strong> {debugInfo.weekdayKey}</div>
                    <div><strong>workerAvailabilityInfo:</strong> <pre className="whitespace-pre-wrap">{debugInfo.workerAvailabilityInfo}</pre></div>
                  </div>
                </div>
              )}

              {/* Check for invalid hours */}
              {selectedDate && (() => {
                const dayKey = getBookingWeekdayKey(selectedDate);
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

              {availableTimeSlots.length === 0 ? (
                <p className="text-sm text-right" style={{ color: "var(--muted)" }}>
                  אין שעות זמינות לתאריך זה
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {availableTimeSlots.map((time) => {
                    const isSelected = selectedTime === time;

                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
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

