"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { computePhases } from "@/lib/bookingPhasesTiming";
import { resolvePhase2Worker } from "@/lib/phase2Assignment";
import { canWorkerPerformService, workersWhoCanPerformService } from "@/lib/workerServiceCompatibility";
import { findWorkerConflictFromBookings } from "@/lib/bookingConflicts";
import {
  createAdminBooking,
  updateAdminBooking,
  type AdminBookingPayload,
} from "@/lib/adminBookings";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";
import type { BookingSettings } from "@/types/bookingSettings";
import type { OpeningHours } from "@/types/booking";
import DurationMinutesStepper from "@/components/admin/DurationMinutesStepper";

/** Display label for a service type (pricing item): service name + optional type (e.g. "תספורת - חצי ראש"). */
function getServiceTypeLabel(item: PricingItem, services: SiteService[]): string {
  const serviceId = item.serviceId || item.service;
  const service = services.find((s) => s.id === serviceId || s.name === serviceId);
  const base = service?.name ?? serviceId ?? item.id;
  return item.type && item.type.trim() ? `${base} - ${item.type.trim()}` : base;
}

const SLOT_MINUTES = 15;

function roundToSlot(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function minutesToHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
    options.push(minutesToHHmm(m));
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

export interface WorkerWithServices {
  id: string;
  name: string;
  services?: string[];
  availability?: OpeningHours[];
}

export interface AdminBookingFormInitialData {
  phase1Id: string;
  phase2Id: string | null;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  phase1: {
    serviceName: string;
    serviceTypeId?: string | null;
    workerId: string;
    workerName: string;
    durationMin: number;
    serviceColor?: string | null;
  };
  phase2: {
    enabled: boolean;
    serviceName: string;
    waitMinutes: number;
    durationMin: number;
    workerId: string | null;
    workerName: string | null;
  } | null;
  note?: string | null;
  status?: string;
  price?: number | null;
}

export interface AdminBookingFormProps {
  mode: "create" | "edit";
  siteId: string;
  defaultDate: string; // YYYY-MM-DD
  workers: WorkerWithServices[];
  services: SiteService[];
  /** Service types (pricing items) for phase 1 dropdown; filtered by site and enabled services. */
  pricingItems: PricingItem[];
  /** Existing clients for "select customer" in add booking; when selected, name and phone are filled. */
  existingClients?: Array<{ id: string; name: string; phone: string }>;
  /** Bookings for the day (for conflict check). In edit mode, exclude the booking being edited. */
  bookingsForDate: Array<{
    id: string;
    phase?: 1 | 2;
    parentBookingId?: string | null;
    workerId?: string | null;
    status?: string;
    startAt?: Date | { toDate: () => Date };
    endAt?: Date | { toDate: () => Date };
    [key: string]: unknown;
  }>;
  bookingSettings?: BookingSettings | null;
  initialData?: AdminBookingFormInitialData | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminBookingForm({
  mode,
  siteId,
  defaultDate,
  workers,
  services,
  pricingItems,
  existingClients = [],
  bookingsForDate,
  bookingSettings,
  initialData,
  onSuccess,
  onCancel,
}: AdminBookingFormProps) {
  // Service types available for phase 1: only items whose service is in the enabled services list
  const phase1ServiceTypeOptions = useMemo(() => {
    return pricingItems.filter((item) => {
      const sid = item.serviceId || item.service;
      return sid && services.some((s) => s.id === sid || s.name === sid);
    });
  }, [pricingItems, services]);

  // Resolve initial phase1ServiceTypeId: from booking, or from serviceName (legacy), or first option
  const initialPhase1ServiceTypeId = useMemo(() => {
    if (initialData?.phase1?.serviceTypeId && initialData.phase1.serviceTypeId.trim()) {
      return initialData.phase1.serviceTypeId;
    }
    const legacyServiceName = initialData?.phase1?.serviceName?.trim();
    if (legacyServiceName) {
      const firstMatch = phase1ServiceTypeOptions.find(
        (p) => (p.serviceId || p.service) === legacyServiceName
      );
      if (firstMatch) return firstMatch.id;
    }
    return phase1ServiceTypeOptions[0]?.id ?? "";
  }, [initialData?.phase1?.serviceTypeId, initialData?.phase1?.serviceName, phase1ServiceTypeOptions]);

  const [customerName, setCustomerName] = useState(initialData?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialData?.customerPhone ?? "");
  const [date, setDate] = useState(initialData?.date ?? defaultDate);
  const [time, setTime] = useState(initialData?.time ?? "09:00");
  const [phase1ServiceTypeId, setPhase1ServiceTypeId] = useState(initialPhase1ServiceTypeId);

  useEffect(() => {
    setPhase1ServiceTypeId(initialPhase1ServiceTypeId);
  }, [initialPhase1ServiceTypeId]);

  const [phase1WorkerId, setPhase1WorkerId] = useState(
    initialData?.phase1?.workerId ?? (workers[0]?.id ?? "")
  );
  const [phase1DurationMin, setPhase1DurationMin] = useState(
    initialData?.phase1?.durationMin ?? 30
  );
  const [phase2Enabled, setPhase2Enabled] = useState(initialData?.phase2?.enabled ?? false);
  const [phase2ServiceName, setPhase2ServiceName] = useState(
    initialData?.phase2?.serviceName ?? (services[0]?.name ?? "")
  );
  const [phase2WaitMin, setPhase2WaitMin] = useState(initialData?.phase2?.waitMinutes ?? 0);
  const [phase2DurationMin, setPhase2DurationMin] = useState(
    initialData?.phase2?.durationMin ?? 30
  );
  const [phase2WorkerOverride, setPhase2WorkerOverride] = useState<string | null>(
    initialData?.phase2?.workerId ?? null
  );
  const [note, setNote] = useState(initialData?.note ?? "");
  const [status, setStatus] = useState<"confirmed" | "cancelled" | "active">(
    (initialData?.status as "confirmed" | "cancelled" | "active") ?? "confirmed"
  );
  const [price, setPrice] = useState<string>(initialData?.price != null ? String(initialData.price) : "");
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    if (!initialData?.customerPhone || existingClients.length === 0) return "";
    const normalized = initialData.customerPhone.replace(/\s|-|\(|\)/g, "");
    const found = existingClients.find((c) => c.id === normalized || c.phone.replace(/\s|-|\(|\)/g, "") === normalized);
    return found ? found.id : "";
  });

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const phase1Worker = workers.find((w) => w.id === phase1WorkerId);
  const phase1WorkerName = phase1Worker?.name ?? "";

  const selectedPhase1Item = useMemo(
    () => phase1ServiceTypeOptions.find((p) => p.id === phase1ServiceTypeId) ?? null,
    [phase1ServiceTypeOptions, phase1ServiceTypeId]
  );
  // Use the same identifier as workers: SiteService.name (workers store service names on their card)
  const phase1ServiceName = useMemo(() => {
    if (!selectedPhase1Item) return "";
    const sid = selectedPhase1Item.serviceId || selectedPhase1Item.service;
    const svc = services.find((x) => x.id === sid || x.name === sid);
    return (svc?.name ?? sid) ?? "";
  }, [selectedPhase1Item, services]);

  const phase1EligibleWorkers = useMemo(() => {
    if (!phase1ServiceName.trim()) return workers;
    return workersWhoCanPerformService(workers, phase1ServiceName);
  }, [workers, phase1ServiceName]);

  // When service type changes, ensure selected worker is eligible; otherwise pick first eligible
  useEffect(() => {
    if (phase1EligibleWorkers.length === 0) return;
    const isEligible = phase1EligibleWorkers.some((w) => w.id === phase1WorkerId);
    if (!isEligible) {
      setPhase1WorkerId(phase1EligibleWorkers[0]?.id ?? "");
    }
  }, [phase1ServiceName, phase1EligibleWorkers, phase1WorkerId]);

  const phase1ServiceColor = useMemo(() => {
    if (!selectedPhase1Item) return null;
    const sid = selectedPhase1Item.serviceId || selectedPhase1Item.service;
    const s = services.find((x) => x.id === sid || x.name === sid);
    return s?.color ?? null;
  }, [services, selectedPhase1Item]);

  const livePreview = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
    const phases = computePhases({
      startAt: start,
      durationMinutes: phase1DurationMin,
      waitMinutes: phase2Enabled ? phase2WaitMin : 0,
      followUpDurationMinutes: phase2Enabled ? phase2DurationMin : 0,
    });
    return {
      phase1End: phases.phase1EndAt,
      phase2Start: phases.phase2StartAt,
      phase2End: phases.phase2EndAt,
    };
  }, [date, time, phase1DurationMin, phase2Enabled, phase2WaitMin, phase2DurationMin]);

  const phase2ResolvedWorker = useMemo(() => {
    if (!phase2Enabled || !phase2ServiceName.trim() || !phase1Worker) return null;
    const [hh, mm] = time.split(":").map(Number);
    const phase1StartMin = hh * 60 + mm;
    const workerWindowByWorkerId: Record<string, { startMin: number; endMin: number } | null> = {};
    workers.forEach((w) => {
      if (w.availability?.length) {
        const dayKey = new Date(date).getDay();
        const dayMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
        const dayConfig = w.availability.find((a) => a.day === dayMap[dayKey]);
        if (dayConfig?.open && dayConfig?.close) {
          const [oh, om] = dayConfig.open.split(":").map(Number);
          const [ch, cm] = dayConfig.close.split(":").map(Number);
          workerWindowByWorkerId[w.id] = { startMin: oh * 60 + om, endMin: ch * 60 + cm };
        } else workerWindowByWorkerId[w.id] = null;
      }
    });
    return resolvePhase2Worker({
      phase1Worker: { id: phase1Worker.id, name: phase1Worker.name },
      dateStr: date,
      phase1StartMinutes: phase1StartMin,
      phase1DurationMin,
      waitMin: phase2WaitMin,
      phase2DurationMin,
      phase2ServiceName: phase2ServiceName.trim(),
      workers,
      bookingsForDate,
      workerWindowByWorkerId: Object.keys(workerWindowByWorkerId).length > 0 ? workerWindowByWorkerId : undefined,
      businessWindow: undefined,
    });
  }, [
    phase2Enabled,
    phase2ServiceName,
    phase1Worker,
    time,
    date,
    phase1DurationMin,
    phase2WaitMin,
    phase2DurationMin,
    workers,
    bookingsForDate,
  ]);

  const excludeBookingIds = useMemo((): string[] => {
    if (mode !== "edit" || !initialData) return [];
    const ids: string[] = [];
    if (typeof initialData.phase1Id === "string" && initialData.phase1Id.length > 0)
      ids.push(initialData.phase1Id);
    if (typeof initialData.phase2Id === "string" && initialData.phase2Id.length > 0)
      ids.push(initialData.phase2Id);
    return ids;
  }, [mode, initialData]);

  const conflictPhase1 = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
    const phases = computePhases({
      startAt: start,
      durationMinutes: phase1DurationMin,
      waitMinutes: 0,
      followUpDurationMinutes: 0,
    });
    return findWorkerConflictFromBookings(
      bookingsForDate,
      phase1WorkerId,
      date,
      start,
      phases.phase1EndAt,
      excludeBookingIds
    );
  }, [bookingsForDate, date, time, phase1DurationMin, phase1WorkerId, excludeBookingIds]);

  const phase2WorkerIdForConflict =
    phase2WorkerOverride ?? phase2ResolvedWorker?.id ?? phase1WorkerId;
  const phase2DateISO =
    livePreview.phase2Start.getFullYear() +
    "-" +
    String(livePreview.phase2Start.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(livePreview.phase2Start.getDate()).padStart(2, "0");
  const conflictPhase2 = useMemo(() => {
    if (!phase2Enabled || !phase2ServiceName.trim() || phase2DurationMin < 1)
      return { hasConflict: false };
    return findWorkerConflictFromBookings(
      bookingsForDate,
      phase2WorkerIdForConflict,
      phase2DateISO,
      livePreview.phase2Start,
      livePreview.phase2End,
      excludeBookingIds
    );
  }, [
    bookingsForDate,
    phase2Enabled,
    phase2ServiceName,
    phase2DurationMin,
    phase2WorkerIdForConflict,
    phase2DateISO,
    livePreview.phase2Start,
    livePreview.phase2End,
    excludeBookingIds,
  ]);

  const workerConflictError = useMemo(() => {
    if (conflictPhase1.hasConflict && conflictPhase1.conflictingBooking)
      return `המטפל כבר תפוס מ־${conflictPhase1.conflictingBooking.timeRange}`;
    if (conflictPhase2.hasConflict && conflictPhase2.conflictingBooking)
      return `המטפל (שלב 2) כבר תפוס מ־${conflictPhase2.conflictingBooking.timeRange}`;
    return null;
  }, [conflictPhase1, conflictPhase2]);

  const hasWorkerConflict = conflictPhase1.hasConflict || conflictPhase2.hasConflict;

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!customerName.trim()) next.customerName = "נא להזין שם לקוח";
    if (!customerPhone.trim()) next.customerPhone = "נא להזין טלפון";
    if (!date.trim()) next.date = "נא לבחור תאריך";
    if (!time.trim()) next.time = "נא לבחור שעה";
    if (!phase1ServiceTypeId.trim()) next.phase1Service = "נא לבחור סוג שירות לשלב 1";
    if (!phase1WorkerId) next.phase1Worker = "נא לבחור מטפל לשלב 1";
    if (phase1Worker && phase1ServiceName && !canWorkerPerformService(phase1Worker, phase1ServiceName)) {
      next.phase1Worker = "המטפל שנבחר לא מבצע שירות זה";
    }
    if (phase1DurationMin < 1) next.phase1Duration = "משך שלב 1 חייב להיות לפחות 1 דקה";
    if (hasWorkerConflict && workerConflictError) next.workerConflict = workerConflictError;

    if (phase2Enabled) {
      if (!phase2ServiceName.trim()) next.phase2Service = "נא לבחור שירות לשלב 2";
      if (phase2DurationMin < 1) next.phase2Duration = "משך שלב 2 חייב להיות לפחות 1 דקה";
      if (phase2WaitMin < 0) next.phase2Wait = "המתנה חייבת להיות 0 ומעלה";
      const resolved = phase2WorkerOverride
        ? workers.find((w) => w.id === phase2WorkerOverride)
        : phase2ResolvedWorker;
      if (!resolved && !phase2WorkerOverride) {
        next.phase2Worker =
          phase2ResolvedWorker === null
            ? `אין מטפל זמין להמשך טיפול בשעה ${livePreview.phase2Start.getHours().toString().padStart(2, "0")}:${livePreview.phase2Start.getMinutes().toString().padStart(2, "0")}`
            : "נא לבחור מטפל לשלב 2 או לאפשר הקצאה אוטומטית";
      } else if (phase2WorkerOverride && phase2ResolvedWorker === null) {
        const overrideWorker = workers.find((w) => w.id === phase2WorkerOverride);
        if (overrideWorker && !canWorkerPerformService(overrideWorker, phase2ServiceName)) {
          next.phase2Worker = "המטפל שנבחר לא מבצע שירות זה";
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [
    customerName,
    customerPhone,
    date,
    time,
    phase1ServiceTypeId,
    phase1ServiceName,
    phase1WorkerId,
    phase1Worker,
    phase1DurationMin,
    hasWorkerConflict,
    workerConflictError,
    phase2Enabled,
    phase2ServiceName,
    phase2DurationMin,
    phase2WaitMin,
    phase2WorkerOverride,
    phase2ResolvedWorker,
    workers,
    livePreview.phase2Start,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (hasWorkerConflict || !validate()) return;

    const phase2WorkerId = phase2WorkerOverride ?? phase2ResolvedWorker?.id ?? null;
    const phase2WorkerName =
      phase2WorkerOverride
        ? workers.find((w) => w.id === phase2WorkerOverride)?.name ?? ""
        : phase2ResolvedWorker?.name ?? "";

    const payload: AdminBookingPayload = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      date,
      time,
      phase1: {
        serviceName: phase1ServiceName.trim(),
        serviceTypeId: phase1ServiceTypeId.trim() || null,
        serviceType: selectedPhase1Item?.type?.trim() ?? null,
        workerId: phase1WorkerId,
        workerName: phase1WorkerName,
        durationMin: phase1DurationMin,
        serviceColor: phase1ServiceColor,
      },
      phase2:
        phase2Enabled && phase2ServiceName.trim() && phase2DurationMin >= 1
          ? {
              enabled: true,
              serviceName: phase2ServiceName.trim(),
              waitMinutes: phase2WaitMin,
              durationMin: phase2DurationMin,
              workerIdOverride: phase2WorkerId,
              workerNameOverride: phase2WorkerName || undefined,
            }
          : null,
      note: note.trim() || null,
      status,
      price: price.trim() ? parseFloat(price) : null,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        await createAdminBooking(siteId, payload);
      } else if (initialData) {
        await updateAdminBooking(
          siteId,
          initialData.phase1Id,
          initialData.phase2Id,
          payload
        );
      }
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (d: Date) =>
    `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">
          {mode === "create" ? "הוספת תור" : "עריכת תור"}
        </h3>
        <button type="button" onClick={onCancel} className="p-1 hover:bg-slate-100 rounded" aria-label="סגור">
          <X className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {(submitError || workerConflictError) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{submitError ?? workerConflictError}</p>
          </div>
        )}

        {existingClients.length > 0 && (
          <div>
            <select
              aria-label="בחר לקוח"
              value={selectedClientId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedClientId(id);
                if (id) {
                  const client = existingClients.find((c) => c.id === id);
                  if (client) {
                    setCustomerName(client.name);
                    setCustomerPhone(client.phone);
                  }
                } else {
                  setCustomerName("");
                  setCustomerPhone("");
                }
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
            >
              <option value="">— לקוח חדש —</option>
              {existingClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שם לקוח *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (selectedClientId) setSelectedClientId("");
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            />
            {errors.customerName && <p className="text-xs text-red-600 mt-0.5">{errors.customerName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">טלפון *</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                if (selectedClientId) setSelectedClientId("");
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            />
            {errors.customerPhone && <p className="text-xs text-red-600 mt-0.5">{errors.customerPhone}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תאריך *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            />
            {errors.date && <p className="text-xs text-red-600 mt-0.5">{errors.date}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שעת התחלה (שלב 1) *</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errors.time && <p className="text-xs text-red-600 mt-0.5">{errors.time}</p>}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">שלב 1</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">סוג שירות *</label>
              <select
                value={phase1ServiceTypeId}
                onChange={(e) => setPhase1ServiceTypeId(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-right ${!phase1ServiceTypeId ? "border-red-300" : "border-slate-300"}`}
              >
                <option value="">בחר סוג שירות</option>
                {phase1ServiceTypeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getServiceTypeLabel(item, services)}
                  </option>
                ))}
              </select>
              {errors.phase1Service && <p className="text-xs text-red-600 mt-0.5">{errors.phase1Service}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">מטפל *</label>
              <select
                value={phase1EligibleWorkers.some((w) => w.id === phase1WorkerId) ? phase1WorkerId : (phase1EligibleWorkers[0]?.id ?? "")}
                onChange={(e) => setPhase1WorkerId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
              >
                {phase1EligibleWorkers.length === 0 ? (
                  <option value="">אין מטפלים שמבצעים שירות זה</option>
                ) : (
                  phase1EligibleWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))
                )}
              </select>
              {phase1ServiceName && phase1EligibleWorkers.length < workers.length && (
                <p className="text-xs text-slate-500 mt-0.5">מוצגים רק מטפלים שמבצעים את השירות הנבחר</p>
              )}
              {errors.phase1Worker && <p className="text-xs text-red-600 mt-0.5">{errors.phase1Worker}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">משך (דקות) *</label>
              <DurationMinutesStepper
                value={phase1DurationMin}
                onChange={setPhase1DurationMin}
                min={0}
                className="w-full px-3 py-2"
              />
              {errors.phase1Duration && <p className="text-xs text-red-600 mt-0.5">{errors.phase1Duration}</p>}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            סיום שלב 1: {formatTime(livePreview.phase1End)}
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={phase2Enabled}
              onChange={(e) => setPhase2Enabled(e.target.checked)}
              className="w-4 h-4 text-caleno-500 rounded"
            />
            <span className="text-sm font-medium text-slate-700">המשך טיפול (שלב 2)</span>
          </label>
          {phase2Enabled && (
            <div className="mt-3 pl-6 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שירות שלב 2 *</label>
                  <select
                    value={phase2ServiceName}
                    onChange={(e) => setPhase2ServiceName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {errors.phase2Service && <p className="text-xs text-red-600 mt-0.5">{errors.phase2Service}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">המתנה אחרי שלב 1 (דקות)</label>
                  <DurationMinutesStepper
                    value={phase2WaitMin}
                    onChange={setPhase2WaitMin}
                    min={0}
                    className="w-full px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">משך שלב 2 (דקות) *</label>
                  <DurationMinutesStepper
                    value={phase2DurationMin}
                    onChange={setPhase2DurationMin}
                    min={0}
                    className="w-full px-3 py-2"
                  />
                  {errors.phase2Duration && <p className="text-xs text-red-600 mt-0.5">{errors.phase2Duration}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">מטפל שלב 2 (אופציונלי)</label>
                  <select
                    value={phase2WorkerOverride ?? ""}
                    onChange={(e) => setPhase2WorkerOverride(e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                  >
                    <option value="">אוטומטי (לפי זמינות)</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  {phase2ResolvedWorker && !phase2WorkerOverride && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      יוקצה: {phase2ResolvedWorker.name}
                    </p>
                  )}
                  {errors.phase2Worker && <p className="text-xs text-red-600 mt-0.5">{errors.phase2Worker}</p>}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                שלב 2: {formatTime(livePreview.phase2Start)} – {formatTime(livePreview.phase2End)}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סטטוס</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "confirmed" | "cancelled" | "active")}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            >
              <option value="confirmed">מאושר</option>
              <option value="active">פעיל</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">מחיר</label>
            <input
              type="number"
              min={0}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
          />
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={saving || hasWorkerConflict}
            className="px-4 py-2 bg-caleno-500 hover:bg-caleno-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {saving ? "שומר..." : mode === "create" ? "הוסף תור" : "שמור שינויים"}
          </button>
        </div>
      </form>
    </div>
  );
}
