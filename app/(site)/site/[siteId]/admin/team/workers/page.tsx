"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import {
  workersCollection,
  workerDoc,
} from "@/lib/firestorePaths";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import { subscribeBookingSettings } from "@/lib/firestoreBookingSettings";
import AdminTabs from "@/components/ui/AdminTabs";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";

import type { SiteService } from "@/types/siteConfig";
import type { OpeningHours } from "@/types/booking";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";

interface Worker {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  services?: string[];
  availability?: OpeningHours[];
  active: boolean;
  createdAt: string;
  /** עמלת טיפולים (%) 0–100, default 0 */
  treatmentCommissionPercent?: number;
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

const WEEKDAYS: Array<{ day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"; label: string }> = [
  { day: "sun", label: "ראשון" },
  { day: "mon", label: "שני" },
  { day: "tue", label: "שלישי" },
  { day: "wed", label: "רביעי" },
  { day: "thu", label: "חמישי" },
  { day: "fri", label: "שישי" },
  { day: "sat", label: "שבת" },
];

const defaultAvailability: OpeningHours[] = WEEKDAYS.map((w) => ({
  day: w.day,
  label: w.label,
  open: w.day === "sat" ? null : "09:00", // Closed on Saturday by default
  close: w.day === "sat" ? null : "18:00",
}));

/** Stable tab config for worker profile (avoids new array reference every render). */
const WORKER_PROFILE_TABS = [
  { key: "details", label: "פרטים" },
  { key: "availability", label: "זמינות" },
  { key: "services", label: "שירותים" },
  { key: "commissions", label: "עמלות" },
] as const;

type WorkerTabType = (typeof WORKER_PROFILE_TABS)[number]["key"];

/** Firestore does not accept undefined. Returns a copy with all undefined keys removed (recursive). */
function deepRemoveUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepRemoveUndefined(item)) as T;
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, deepRemoveUndefined(v)])
  ) as T;
}

/** Returns only valid break rows (start/end non-empty strings). Omit or [] for Firestore; no undefined. */
function normalizeBreaksForFirestore(
  breaks: Array<{ start?: string; end?: string }> | undefined
): Array<{ start: string; end: string }> | undefined {
  if (!breaks?.length) return undefined;
  const valid = breaks.filter(
    (b) => b != null && typeof b.start === "string" && typeof b.end === "string" && b.start.trim() !== "" && b.end.trim() !== ""
  );
  if (valid.length === 0) return undefined;
  return valid.map((b) => ({ start: b.start!.trim(), end: b.end!.trim() }));
}

/** Build availability payload safe for Firestore: no undefined, only valid breaks. */
function availabilityForFirestore(availability: OpeningHours[]): OpeningHours[] {
  return availability.map((day) => {
    const normalized = normalizeBreaksForFirestore(day.breaks);
    const next: OpeningHours = {
      day: day.day,
      label: day.label,
      open: day.open,
      close: day.close,
    };
    if (normalized && normalized.length > 0) next.breaks = normalized;
    return next;
  });
}

/** Stable snapshot for dirty detection on the add / edit worker card. */
function serializeWorkerFormState(fd: Partial<Worker>): string {
  const services = [...(fd.services ?? [])].sort();
  const availability = (fd.availability ?? defaultAvailability).map((day) => ({
    day: day.day,
    label: day.label,
    open: day.open ?? null,
    close: day.close ?? null,
    breaks: (day.breaks ?? []).map((b) => ({ start: b.start, end: b.end })),
  }));
  return JSON.stringify({
    name: fd.name ?? "",
    role: fd.role ?? "",
    phone: fd.phone ?? "",
    email: fd.email ?? "",
    services,
    availability,
    active: fd.active !== false,
    treatmentCommissionPercent: Math.min(100, Math.max(0, Number(fd.treatmentCommissionPercent) || 0)),
  });
}

export default function WorkersPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const unsavedCtx = useUnsavedChanges();
  const formBaselineSerializedRef = useRef("");
  const performWorkerSaveRef = useRef<() => Promise<void>>(async () => {});

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  /** True when user clicked "הוסף עובד" and we show the add-worker form; false when showing empty state or a selected worker. */
  const [isAddingWorker, setIsAddingWorker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  
  // Tab state for worker details
  const [activeWorkerTab, setActiveWorkerTab] = useState<WorkerTabType>("details");
  
  // Reset tab when worker changes
  useEffect(() => {
    if (selectedWorkerId) {
      setActiveWorkerTab("details");
    }
  }, [selectedWorkerId]);

  const workerCardRef = useRef<HTMLDivElement>(null);

  // On mobile, scroll to worker card when a worker is selected or add form is shown
  useEffect(() => {
    if (!selectedWorkerId && !isAddingWorker) return;
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;
    const el = workerCardRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedWorkerId, isAddingWorker]);
  
  // Services from Firestore (same source as Pricing/Services page)
  const [services, setServices] = useState<SiteService[]>([]);
  
  // Business hours from Firestore (site-level booking settings)
  const [businessHours, setBusinessHours] = useState<BookingSettings>(defaultBookingSettings);

  // Helper: Convert weekday key ("sun", "mon", etc.) to business hours day key ("0", "1", etc.)
  const weekdayToBusinessDayKey = (weekday: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"): "0" | "1" | "2" | "3" | "4" | "5" | "6" => {
    const mapping: Record<string, "0" | "1" | "2" | "3" | "4" | "5" | "6"> = {
      sun: "0",
      mon: "1",
      tue: "2",
      wed: "3",
      thu: "4",
      fri: "5",
      sat: "6",
    };
    return mapping[weekday] || "0";
  };

  // Helper: Get business hours config for a weekday
  const getBusinessDayConfig = (weekday: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat") => {
    const dayKey = weekdayToBusinessDayKey(weekday);
    return businessHours.days[dayKey];
  };

  // Helper: Clamp time value within business hours range
  const clampTime = (time: string | null, businessStart: string, businessEnd: string, isStart: boolean): string => {
    if (!time) return isStart ? businessStart : businessEnd;
    
    // Compare times as strings (HH:MM format)
    if (isStart) {
      // For start time, ensure it's >= business start
      return time < businessStart ? businessStart : time;
    } else {
      // For end time, ensure it's <= business end
      return time > businessEnd ? businessEnd : time;
    }
  };

  // Helper: Clamp worker availability to business hours (preserves breaks when day is open)
  const clampWorkerAvailability = (availability: OpeningHours[]): OpeningHours[] => {
    return availability.map((day) => {
      const businessDay = getBusinessDayConfig(day.day);
      
      // If business is closed on this day, force worker to be closed and clear breaks
      if (!businessDay.enabled) {
        return {
          ...day,
          open: null,
          close: null,
          breaks: undefined,
        };
      }
      
      // If worker day is closed, keep it closed and clear breaks
      if (!day.open || !day.close) {
        return { ...day, breaks: undefined };
      }
      
      // Clamp worker hours within business hours
      const clampedOpen = clampTime(day.open, businessDay.start, businessDay.end, true);
      const clampedClose = clampTime(day.close, businessDay.start, businessDay.end, false);
      
      // Ensure start < end
      if (clampedOpen >= clampedClose) {
        return {
          ...day,
          open: businessDay.start,
          close: businessDay.end,
          breaks: undefined,
        };
      }
      
      return {
        ...day,
        open: clampedOpen,
        close: clampedClose,
      };
    });
  };

  const getWorkerBreaksError = (dayIndex: number): string | null => {
    const day = (formData.availability || defaultAvailability)[dayIndex];
    if (!day?.open || !day?.close) return null;
    const breaks = day.breaks ?? [];
    const openMin = (parseInt(day.open.split(":")[0], 10) || 0) * 60 + (parseInt(day.open.split(":")[1], 10) || 0);
    const closeMin = (parseInt(day.close.split(":")[0], 10) || 0) * 60 + (parseInt(day.close.split(":")[1], 10) || 0);
    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i]!;
      const [sH, sM] = b.start.split(":").map(Number);
      const [eH, eM] = b.end.split(":").map(Number);
      const sMin = (sH ?? 0) * 60 + (sM ?? 0);
      const eMin = (eH ?? 0) * 60 + (eM ?? 0);
      if (sMin >= eMin) return `הפסקה ${i + 1}: שעת התחלה חייבת להיות לפני שעת סיום`;
      if (sMin < openMin || eMin > closeMin) return `הפסקה ${i + 1}: חייבת להיות בתוך שעות העובד`;
      for (let j = i + 1; j < breaks.length; j++) {
        const o = breaks[j]!;
        const oS = (parseInt(o.start.split(":")[0], 10) || 0) * 60 + (parseInt(o.start.split(":")[1], 10) || 0);
        const oE = (parseInt(o.end.split(":")[0], 10) || 0) * 60 + (parseInt(o.end.split(":")[1], 10) || 0);
        if (sMin < oE && eMin > oS) return "הפסקות לא יכולות לחפוף";
      }
    }
    return null;
  };

  const updateDayBreaks = (dayIndex: number, breaks: { start: string; end: string }[]) => {
    const availability = [...(formData.availability || defaultAvailability)];
    const day = availability[dayIndex];
    if (!day) return;
    availability[dayIndex] = { ...day, breaks: breaks.length > 0 ? breaks : undefined };
    setFormData({ ...formData, availability });
  };

  const addWorkerBreak = (dayIndex: number) => {
    const day = (formData.availability || defaultAvailability)[dayIndex];
    if (!day?.open || !day?.close) return;
    const existing = day.breaks ?? [];
    // Initialize with valid HH:mm so we never write undefined; user can edit.
    const newBreak: { start: string; end: string } = { start: "12:00", end: "13:00" };
    updateDayBreaks(dayIndex, [...existing, newBreak]);
  };

  const removeWorkerBreak = (dayIndex: number, breakIndex: number) => {
    const existing = [...((formData.availability || defaultAvailability)[dayIndex]?.breaks ?? [])];
    updateDayBreaks(dayIndex, existing.filter((_, i) => i !== breakIndex));
  };

  const updateWorkerBreak = (dayIndex: number, breakIndex: number, field: "start" | "end", value: string) => {
    const existing = [...((formData.availability || defaultAvailability)[dayIndex]?.breaks ?? [])];
    if (!existing[breakIndex]) return;
    existing[breakIndex] = { ...existing[breakIndex]!, [field]: value };
    updateDayBreaks(dayIndex, existing);
  };

  // Selected worker form state
  const [formData, setFormData] = useState<Partial<Worker>>({
    name: "",
    role: "",
    phone: "",
    email: "",
    services: [],
    availability: defaultAvailability,
    active: true,
    treatmentCommissionPercent: 0,
  });

  // Load services from Firestore (same source as Pricing/Services page)
  useEffect(() => {
    if (!siteId) return;

    const unsubscribeServices = subscribeSiteServices(
      siteId,
      (svcs) => {
        // Only show enabled services (enabled !== false)
        // Note: service.name is used as the identifier for worker.services matching
        const enabledServices = svcs.filter((s) => s.enabled !== false);
        
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Workers] Loaded ${enabledServices.length} services from sites/${siteId}.services`);
          console.log(`[Workers] Services:`, enabledServices.map(s => ({ id: s.id, name: s.name, enabled: s.enabled })));
        }
        
        setServices(enabledServices);
      },
      (err) => {
        console.error("[Workers] Failed to load services", err);
        console.error("[Workers] siteId:", siteId, "path: sites/" + siteId + ".services");
        setServices([]);
      }
    );

    return () => {
      unsubscribeServices();
    };
  }, [siteId]);

  // Load business hours from Firestore (site-level booking settings)
  useEffect(() => {
    if (!siteId) return;

    const unsubscribeBusinessHours = subscribeBookingSettings(
      siteId,
      (settings) => {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Workers] Loaded business hours from Firestore for site ${siteId}:`, {
            slotMinutes: settings.slotMinutes,
            days: Object.entries(settings.days).map(([key, day]) => ({
              dayKey: key,
              enabled: day.enabled,
              hours: `${day.start}-${day.end}`,
            })),
          });
        }
        setBusinessHours(settings);
      },
      (err) => {
        console.error("[Workers] Failed to load business hours", err);
        setBusinessHours(defaultBookingSettings);
      }
    );

    return () => {
      unsubscribeBusinessHours();
    };
  }, [siteId]);

  // Load workers
  useEffect(() => {
    if (!db || !siteId) return;

    setWorkersLoading(true);
    setWorkersError(null);

    let workersQuery;
    try {
      workersQuery = query(workersCollection(siteId), orderBy("createdAt", "asc"), limit(100));
    } catch (e) {
      workersQuery = query(workersCollection(siteId), limit(100));
    }

    const workersUnsubscribe = onSnapshotDebug(
      "workers-list",
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => {
          const data = d.data();
          // Ensure availability is properly formatted
          let availability = defaultAvailability;
          if (data.availability && Array.isArray(data.availability)) {
            // Map loaded availability to ensure it matches OpeningHours structure
            availability = data.availability.map((day: any, idx: number) => ({
              day: day.day || WEEKDAYS[idx]?.day || "sun",
              label: day.label || WEEKDAYS[idx]?.label || "",
              open: day.open || null,
              close: day.close || null,
              breaks: day.breaks && Array.isArray(day.breaks) ? day.breaks.map((b: { start: string; end: string }) => ({ start: b.start, end: b.end })) : undefined,
            })) as OpeningHours[];
            // Ensure we have all 7 days
            if (availability.length !== 7) {
              availability = defaultAvailability;
            }
          }
          return {
            id: d.id,
            name: data.name || "",
            role: data.role || "",
            phone: data.phone || "",
            email: data.email || "",
            services: data.services || [],
            availability,
            active: data.active !== false,
            createdAt: data.createdAt || new Date().toISOString(),
            treatmentCommissionPercent: data.treatmentCommissionPercent != null ? Number(data.treatmentCommissionPercent) : 0,
          } as Worker;
        });
        setWorkers(items);
        setWorkersLoading(false);
        setWorkersError(null);
      },
      (err) => {
        console.error("[Workers] Failed to load workers", err);
        setWorkersError(err.message);
        setWorkersLoading(false);
        setWorkers([]);
      }
    );

    return () => {
      workersUnsubscribe();
    };
  }, [siteId]);

  // Load selected worker data into form
  useEffect(() => {
    // Default: all services checked (worker can do all unless explicitly unchecked)
    const allServiceNames = services.map((s) => s.name);
    if (selectedWorkerId) {
      const worker = workers.find((w) => w.id === selectedWorkerId);
      if (worker) {
        // If worker has no services or empty array, default to all services checked
        const rawServices = worker.services ?? [];
        const servicesToShow =
          rawServices.length === 0
            ? allServiceNames
            : normalizeWorkerServices(rawServices);
        // Clamp worker availability to business hours (backwards compatibility)
        let normalizedAvailability = worker.availability || defaultAvailability;
        normalizedAvailability = clampWorkerAvailability(normalizedAvailability);
        const nextForm: Partial<Worker> = {
          name: worker.name || "",
          role: worker.role || "",
          phone: worker.phone || "",
          email: worker.email || "",
          services: servicesToShow,
          availability: normalizedAvailability,
          active: worker.active !== false,
          treatmentCommissionPercent: worker.treatmentCommissionPercent ?? 0,
        };
        setFormData(nextForm);
        formBaselineSerializedRef.current = serializeWorkerFormState(nextForm);
      }
    } else if (isAddingWorker) {
      // New worker: default all service checkboxes checked
      const initialAvailability = defaultAvailability.map((day) => {
        const businessDay = getBusinessDayConfig(day.day);
        if (!businessDay.enabled) {
          return {
            ...day,
            open: null,
            close: null,
          };
        }
        return {
          ...day,
          open: businessDay.start,
          close: businessDay.end,
        };
      });
      const nextForm: Partial<Worker> = {
        name: "",
        role: "",
        phone: "",
        email: "",
        services: allServiceNames,
        availability: initialAvailability,
        active: true,
        treatmentCommissionPercent: 0,
      };
      setFormData(nextForm);
      formBaselineSerializedRef.current = serializeWorkerFormState(nextForm);
    }
  }, [selectedWorkerId, isAddingWorker, workers, services, businessHours]);

  const handleAddWorker = async () => {
    if (!db || !siteId) {
      setError("לא ניתן לשמור כרגע");
      throw new Error("WORKER_VALIDATION");
    }
    if (!formData.name?.trim()) {
      setError("יש להזין שם עובד");
      throw new Error("WORKER_VALIDATION");
    }
    try {
      setSaving(true);
      setError(null);
      // Normalize services before saving to ensure only valid service names are stored
      const normalizedServices = normalizeWorkerServices(formData.services || []);
      
      // Clamp availability to business hours before saving
      const clampedAvailability = clampWorkerAvailability(formData.availability || defaultAvailability);
      const availabilityPayload = availabilityForFirestore(clampedAvailability);

      const commission = Math.min(100, Math.max(0, Number(formData.treatmentCommissionPercent) || 0));
      const newWorker = deepRemoveUndefined({
        name: formData.name.trim(),
        role: formData.role?.trim() || null,
        phone: formData.phone?.trim() || null,
        email: formData.email?.trim() || null,
        services: normalizedServices,
        availability: availabilityPayload,
        active: formData.active !== false,
        treatmentCommissionPercent: commission,
        createdAt: new Date().toISOString(),
      });
      const docRef = await addDoc(workersCollection(siteId), newWorker);
      setSelectedWorkerId(docRef.id);
      setIsAddingWorker(false);
      if (process.env.NODE_ENV !== "production") {
        console.log("[Workers] Add worker success", { workerId: docRef.id, treatmentCommissionPercent: commission });
      }
      setSaveMessage("עובד נוסף בהצלחה");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      console.error("[Workers] Failed to add worker", err);
      setError("שגיאה בהוספת עובד");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorker = async () => {
    if (!db || !siteId || !selectedWorkerId) {
      setError("לא ניתן לשמור כרגע");
      throw new Error("WORKER_VALIDATION");
    }
    if (!formData.name?.trim()) {
      setError("יש להזין שם עובד");
      throw new Error("WORKER_VALIDATION");
    }
    try {
      setSaving(true);
      setError(null);
      // Normalize services before saving to ensure only valid service names are stored
      const normalizedServices = normalizeWorkerServices(formData.services || []);
      
      // Clamp availability to business hours before saving
      const clampedAvailability = clampWorkerAvailability(formData.availability || defaultAvailability);
      const availabilityPayload = availabilityForFirestore(clampedAvailability);

      const commission = Math.min(100, Math.max(0, Number(formData.treatmentCommissionPercent) || 0));
      const updatePayload = deepRemoveUndefined({
        name: formData.name.trim(),
        role: formData.role?.trim() || null,
        phone: formData.phone?.trim() || null,
        email: formData.email?.trim() || null,
        services: normalizedServices,
        availability: availabilityPayload,
        active: formData.active !== false,
        treatmentCommissionPercent: commission,
      });
      await updateDoc(workerDoc(siteId, selectedWorkerId), updatePayload);
      if (process.env.NODE_ENV !== "production") {
        console.log("[Workers] Save worker success", { workerId: selectedWorkerId, treatmentCommissionPercent: commission });
      }
      setSaveMessage("השינויים נשמרו בהצלחה");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      console.error("[Workers] Failed to update worker", err);
      setError("שגיאה בשמירת השינויים");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorker = async () => {
    if (!db || !siteId || !selectedWorkerId) return;
    if (!confirm("האם אתה בטוח שברצונך למחוק את העובד?")) return;
    try {
      await deleteDoc(workerDoc(siteId, selectedWorkerId));
      setSelectedWorkerId(null);
      setError(null);
    } catch (err) {
      console.error("[Workers] Failed to delete worker", err);
      setError("שגיאה במחיקת עובד");
    }
  };

  performWorkerSaveRef.current = async () => {
    if (selectedWorkerId) await handleSaveWorker();
    else if (isAddingWorker) await handleAddWorker();
  };

  const inWorkerEditor = Boolean(selectedWorkerId) || isAddingWorker;
  const isWorkerFormDirty =
    inWorkerEditor && serializeWorkerFormState(formData) !== formBaselineSerializedRef.current;

  useEffect(() => {
    if (!unsavedCtx) return;
    if (!isWorkerFormDirty) {
      unsavedCtx.setUnsaved(false, () => {});
      return;
    }
    unsavedCtx.setUnsaved(true, () => performWorkerSaveRef.current());
    return () => unsavedCtx.setUnsaved(false, () => {});
  }, [unsavedCtx, isWorkerFormDirty]);

  useEffect(() => {
    if (!isWorkerFormDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isWorkerFormDirty]);

  const checkAndProceed = (fn: () => void) => {
    if (unsavedCtx) unsavedCtx.checkAndProceed(fn);
    else fn();
  };

  const toggleService = (serviceId: string) => {
    const current = formData.services || [];
    if (current.includes(serviceId)) {
      setFormData({ ...formData, services: current.filter((s) => s !== serviceId) });
    } else {
      setFormData({ ...formData, services: [...current, serviceId] });
    }
  };

  // Helper: Normalize worker services to use service.name as identifier
  // Worker services array stores service names (not IDs) to match booking logic
  // This ensures backward compatibility with workers that have old service names stored
  const normalizeWorkerServices = (workerServices: string[]): string[] => {
    if (!workerServices || workerServices.length === 0) return [];
    if (services.length === 0) return workerServices; // No services loaded yet, keep as-is
    
    // Worker services should be service names (service.name), not service IDs
    // Filter to only include services that exist in the current services list
    return workerServices.filter((serviceName) => {
      // Check if this service name exists in the current services
      const exists = services.some((s) => s.name === serviceName);
      if (!exists && process.env.NODE_ENV !== "production") {
        console.log(`[Workers] Filtering out invalid service name: "${serviceName}" (not found in current services)`);
      }
      return exists;
    });
  };

  const updateAvailability = (dayIndex: number, field: "open" | "close", value: string | null) => {
    const availability = [...(formData.availability || defaultAvailability)];
    const day = availability[dayIndex];
    const businessDay = getBusinessDayConfig(day.day);
    
    // If business is closed on this day, don't allow changes
    if (!businessDay.enabled) {
      return;
    }
    
    let newValue = value;
    
    // Clamp the value within business hours
    if (newValue) {
      if (field === "open") {
        // Start time must be >= business start
        newValue = clampTime(newValue, businessDay.start, businessDay.end, true);
      } else {
        // End time must be <= business end
        newValue = clampTime(newValue, businessDay.start, businessDay.end, false);
      }
    }
    
    availability[dayIndex] = {
      ...day,
      [field]: newValue,
    };
    
    // Ensure start < end after update
    if (availability[dayIndex].open && availability[dayIndex].close) {
      if (availability[dayIndex].open >= availability[dayIndex].close) {
        // If invalid, use business hours
        availability[dayIndex] = {
          ...day,
          open: businessDay.start,
          close: businessDay.end,
        };
      }
    }
    
    setFormData({ ...formData, availability });
  };

  const toggleDayAvailability = (dayIndex: number) => {
    const availability = [...(formData.availability || defaultAvailability)];
    const day = availability[dayIndex];
    const businessDay = getBusinessDayConfig(day.day);
    
    // If business is closed on this day, don't allow enabling
    if (!businessDay.enabled) {
      return;
    }
    
    const isClosed = !day.open && !day.close;
    if (isClosed) {
      // Enable with business hours
      availability[dayIndex] = {
        ...day,
        open: businessDay.start,
        close: businessDay.end,
      };
    } else {
      // Disable: clear breaks
      availability[dayIndex] = {
        ...day,
        open: null,
        close: null,
        breaks: undefined,
      };
    }
    setFormData({ ...formData, availability });
  };

  // Use services from Firestore (same source as Pricing/Services page)
  // Services are already filtered to enabled only (enabled !== false)

  return (
    <div dir="rtl" className="min-h-screen w-full">
      <div className="w-full max-w-7xl mx-auto min-w-0">
        <div className="mb-6">
          <AdminPageHero
            title="עובדים"
            subtitle="ניהול עובדים, שירותים וזמינות"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {saveMessage && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-right">
            <p className="text-sm text-emerald-700">{saveMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full min-w-0">
          {/* Workers List */}
          <div className="lg:col-span-1 min-w-0">
            <AdminCard className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-[#0F172A]">רשימת עובדים</h2>
                <button
                  onClick={() => {
                    checkAndProceed(() => {
                      setSelectedWorkerId(null);
                      setIsAddingWorker(true);
                    });
                  }}
                  className="rounded-full px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-medium transition-colors shadow-sm"
                >
                  + הוסף עובד
                </button>
              </div>

              {workersLoading ? (
                <p className="text-sm text-[#64748B] text-center py-8">טוען עובדים…</p>
              ) : workers.length === 0 ? (
                <p className="text-sm text-[#64748B] text-center py-8">אין עובדים רשומים</p>
              ) : (
                <div className="space-y-2">
                  {workers.map((worker) => (
                    <button
                      key={worker.id}
                      onClick={() => {
                        if (worker.id === selectedWorkerId && !isAddingWorker) return;
                        checkAndProceed(() => {
                          setSelectedWorkerId(worker.id);
                          setIsAddingWorker(false);
                        });
                      }}
                      className={`w-full text-right p-3 rounded-lg border transition-colors ${
                        selectedWorkerId === worker.id
                          ? "border-[#1E6F7C] bg-[rgba(30,111,124,0.08)]"
                          : "border-[#E2E8F0] hover:border-[#E2E8F0]/80 hover:bg-[rgba(15,23,42,0.04)]"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <h3 className="font-semibold text-[#0F172A]">{worker.name}</h3>
                          {worker.role && (
                            <p className="text-xs text-[#64748B]">{worker.role}</p>
                          )}
                        </div>
                        {!worker.active && (
                          <span className="text-xs text-[#64748B]">לא פעיל</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </AdminCard>
          </div>

          {/* Worker Details Card — empty state, new worker form, or פרטי עובד (ref for mobile scroll-into-view) */}
          <div ref={workerCardRef} className="lg:col-span-2 min-w-0">
            {!selectedWorkerId && !isAddingWorker ? (
              <AdminCard className="p-6">
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-2">בחר עובד מהרשימה</p>
                  <p className="text-sm text-slate-400">
                    פרטי העובד והיסטוריית התורים יופיעו כאן
                  </p>
                </div>
              </AdminCard>
            ) : (
            <AdminCard className="p-6">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-[#0F172A]">
                    {selectedWorkerId ? "פרטי עובד" : "עובד חדש"}
                  </h2>
                  <div className="flex items-center gap-2">
                    {isAddingWorker && (
                      <button
                        type="button"
                        onClick={() => checkAndProceed(() => setIsAddingWorker(false))}
                        className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
                      >
                        ביטול
                      </button>
                    )}
                    {selectedWorkerId && (
                      <button
                        onClick={handleDeleteWorker}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
                      >
                        מחק עובד
                      </button>
                    )}
                  </div>
                </div>

                <AdminTabs
                  tabs={WORKER_PROFILE_TABS}
                  activeKey={activeWorkerTab}
                  onChange={setActiveWorkerTab}
                />

                {/* Tab Content */}
                <div>
                    {/* Details Tab */}
                    {activeWorkerTab === "details" && (
                      <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">
                        שם עובד *
                      </label>
                      <input
                        type="text"
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">
                        תפקיד
                      </label>
                      <input
                        type="text"
                        value={formData.role || ""}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">
                        טלפון
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ""}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                        placeholder="050-1234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">
                        אימייל
                      </label>
                      <input
                        type="email"
                        value={formData.email || ""}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                        placeholder="worker@example.com"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.active !== false}
                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                        className="w-4 h-4 text-caleno-deep rounded focus:ring-caleno-deep"
                      />
                      <label className="text-sm font-medium text-[#0F172A]">פעיל</label>
                    </div>
                      </div>
                    )}

                    {/* Availability Tab */}
                    {activeWorkerTab === "availability" && (
                      <div>
                        <p className="text-xs text-[#64748B] mb-4 text-right">
                          שעות העובד חייבות להיות בתוך שעות הפתיחה של העסק. ימים שהעסק סגור בהם לא ניתן להגדיר.
                        </p>
                        <div className="space-y-3">
                          {(formData.availability || defaultAvailability).map((day, index) => {
                            const isClosed = !day.open && !day.close;
                            const businessDay = getBusinessDayConfig(day.day);
                            const isBusinessClosed = !businessDay.enabled;
                            
                            return (
                              <div
                                key={day.day}
                                className={`p-3 border rounded-lg ${
                                  isBusinessClosed 
                                    ? "border-[#E2E8F0] bg-[rgba(15,23,42,0.04)] opacity-60" 
                                    : "border-[#E2E8F0]"
                                }`}
                              >
                                <div className="flex items-center gap-3 flex-wrap">
                                  <div className={`w-20 text-sm font-medium ${isBusinessClosed ? "text-[#64748B]" : "text-[#0F172A]"}`}>
                                    {day.label}
                                    {isBusinessClosed && (
                                      <span className="block text-xs text-[#64748B] mt-1">(סגור)</span>
                                    )}
                                  </div>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!isClosed}
                                      onChange={() => toggleDayAvailability(index)}
                                      disabled={isBusinessClosed}
                                      className="w-4 h-4 text-caleno-deep rounded focus:ring-caleno-deep disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <span className={`text-xs ${isBusinessClosed ? "text-[#64748B]" : "text-[#64748B]"}`}>פעיל</span>
                                  </label>
                                  {!isClosed && !isBusinessClosed && (
                                    <>
                                      <input
                                        type="time"
                                        value={day.open || ""}
                                        onChange={(e) => updateAvailability(index, "open", e.target.value)}
                                        min={businessDay.start}
                                        max={businessDay.end}
                                        className="px-2 py-1 border border-[#E2E8F0] rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                                      />
                                      <span className="text-xs text-[#64748B]">עד</span>
                                      <input
                                        type="time"
                                        value={day.close || ""}
                                        onChange={(e) => updateAvailability(index, "close", e.target.value)}
                                        min={businessDay.start}
                                        max={businessDay.end}
                                        className="px-2 py-1 border border-[#E2E8F0] rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                                      />
                                      {businessDay.enabled && (
                                        <span className="text-xs text-[#64748B]">
                                          (עסק: {businessDay.start}-{businessDay.end})
                                        </span>
                                      )}
                                    </>
                                  )}
                                  {!isClosed && isBusinessClosed && (
                                    <span className="text-xs text-[#64748B]">העסק סגור ביום זה</span>
                                  )}
                                </div>
                                {!isClosed && !isBusinessClosed && day.open && day.close && (
                                  <div className="mt-2 mr-0 pr-2 border-t border-[#E2E8F0] pt-2">
                                    <p className="text-xs font-medium text-[#64748B] mb-1">הפסקות</p>
                                    {(day.breaks ?? []).map((b, bi) => (
                                      <div key={bi} className="flex items-center gap-2 mb-1">
                                        <input
                                          type="time"
                                          value={b.start}
                                          onChange={(e) => updateWorkerBreak(index, bi, "start", e.target.value)}
                                          min={day.open!}
                                          max={day.close!}
                                          className="px-2 py-1 border border-[#E2E8F0] rounded text-sm text-right w-24"
                                        />
                                        <span className="text-xs text-[#64748B]">עד</span>
                                        <input
                                          type="time"
                                          value={b.end}
                                          onChange={(e) => updateWorkerBreak(index, bi, "end", e.target.value)}
                                          min={day.open!}
                                          max={day.close!}
                                          className="px-2 py-1 border border-[#E2E8F0] rounded text-sm text-right w-24"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeWorkerBreak(index, bi)}
                                          className="p-1 text-[#64748B] hover:text-red-600 rounded"
                                          aria-label="הסר הפסקה"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => addWorkerBreak(index)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-caleno-deep shadow-sm transition-colors hover:border-caleno-deep/40 hover:bg-[#F8FAFC] hover:text-caleno-ink"
                                    >
                                      הוסף הפסקה
                                    </button>
                                    {getWorkerBreaksError(index) && (
                                      <p className="text-red-600 text-xs mt-0.5">{getWorkerBreaksError(index)}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Commissions Tab */}
                    {activeWorkerTab === "commissions" && (
                      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 text-right">
                        <h3 className="text-lg font-bold text-[#0F172A] mb-1">עמלות</h3>
                        <p className="text-sm text-[#64748B] mb-4">
                          קבע אחוז תשלום לעובד מכל הזמנה.
                        </p>
                        <div>
                          <label className="block text-sm font-medium text-[#0F172A] mb-1">
                            אחוז לעובד (%)
                          </label>
                          <p className="text-xs text-[#64748B] mb-1">חלק העובד מההכנסה (העסק מקבל את השאר)</p>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={formData.treatmentCommissionPercent ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setFormData({ ...formData, treatmentCommissionPercent: 0 });
                                return;
                              }
                              const num = parseFloat(val);
                              if (!Number.isNaN(num)) {
                                const clamped = Math.min(100, Math.max(0, num));
                                setFormData({ ...formData, treatmentCommissionPercent: clamped });
                              }
                            }}
                            onBlur={() => {
                              const v = formData.treatmentCommissionPercent;
                              if (v != null && (v < 0 || v > 100)) {
                                const clamped = Math.min(100, Math.max(0, v));
                                setFormData({ ...formData, treatmentCommissionPercent: clamped });
                              }
                            }}
                            placeholder="0"
                            className="w-full max-w-[120px] rounded-lg border border-[#E2E8F0] px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                          />
                        </div>
                      </div>
                    )}

                    {/* Services Tab */}
                    {activeWorkerTab === "services" && (
                      <div className="space-y-4">
                        {services.length === 0 ? (
                          <p className="text-sm text-[#64748B]">אין שירותים מוגדרים. הוסף שירותים בעמוד המחירון.</p>
                        ) : (
                          <div className="space-y-2">
                            {(formData.services || []).length === 0 && (
                              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                עובד זה לא יהיה ניתן להזמנה עבור אף שירות. בחר לפחות שירות אחד.
                              </p>
                            )}
                            {services.map((service) => {
                              // Use service.name as the ID (same as Pricing/Services page)
                              const serviceId = service.name;
                              const isChecked = (formData.services || []).includes(serviceId);
                              
                              return (
                                <label
                                  key={service.id}
                                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-[rgba(15,23,42,0.04)] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleService(serviceId)}
                                    className="w-4 h-4 text-caleno-deep rounded focus:ring-caleno-deep"
                                  />
                                  <span className="text-sm text-[#0F172A]">{service.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {/* Save / Add Button */}
                <div className="border-t border-[#E2E8F0] pt-4 flex flex-wrap gap-2">
                  {selectedWorkerId ? (
                    <button
                      onClick={handleSaveWorker}
                      disabled={saving || !formData.name?.trim() || (formData.availability || defaultAvailability).some((_, idx) => getWorkerBreaksError(idx) != null)}
                      className="flex-1 min-w-[140px] px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                    >
                      {saving ? "שומר..." : "שמור שינויים"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleAddWorker}
                        disabled={saving || !formData.name?.trim() || (formData.availability || defaultAvailability).some((_, idx) => getWorkerBreaksError(idx) != null)}
                        className="flex-1 min-w-[140px] px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                      >
                        {saving ? "שומר..." : "שמור עובד"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ name: "", role: "", phone: "", email: "", services: [], availability: defaultAvailability, active: true, treatmentCommissionPercent: 0 })}
                        className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#0F172A] rounded-lg font-medium text-sm"
                      >
                        נקה
                      </button>
                    </>
                  )}
                </div>
              </div>
            </AdminCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
