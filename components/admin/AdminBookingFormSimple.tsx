"use client";

import { useState, useMemo, useCallback } from "react";
import { X } from "lucide-react";
import {
  createAdminBooking,
  updateAdminBooking,
  type AdminBookingPayload,
} from "@/lib/adminBookings";
import { findWorkerConflictFromBookings } from "@/lib/bookingConflicts";

const SLOT_MINUTES = 15;
const DURATION_MIN_MAX = 480; // 8 hours
const DEFAULT_DURATION_MIN = 60;

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

export interface SimpleFormWorker {
  id: string;
  name: string;
}

/** For edit: editable fields + full snapshot so we can merge on save without overwriting service/phase. */
export interface AdminBookingFormSimpleEditData {
  date: string;
  time: string;
  workerId: string;
  workerName: string;
  durationMin: number;
  phase1Id: string;
  phase2Id: string | null;
  customerName: string;
  customerPhone: string;
  note?: string | null;
  status?: string;
  price?: number | null;
  phase1: {
    serviceName: string;
    serviceTypeId?: string | null;
    serviceType?: string | null;
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
}

export interface AdminBookingFormSimpleProps {
  mode: "create" | "edit";
  siteId: string;
  defaultDate: string;
  workers: SimpleFormWorker[];
  existingClients?: Array<{ id: string; name: string; phone: string }>;
  bookingsForDate: Array<{
    id: string;
    phase?: 1 | 2;
    parentBookingId?: string | null;
    workerId?: string | null;
    status?: string;
    startAt?: Date | { toDate: () => Date };
    endAt?: Date | { toDate: () => Date };
    date?: string;
    dateStr?: string;
    dateISO?: string;
    [key: string]: unknown;
  }>;
  initialData?: AdminBookingFormSimpleEditData | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminBookingFormSimple({
  mode,
  siteId,
  defaultDate,
  workers,
  existingClients = [],
  bookingsForDate,
  initialData,
  onSuccess,
  onCancel,
}: AdminBookingFormSimpleProps) {
  const [date, setDate] = useState(initialData?.date ?? defaultDate);
  const [time, setTime] = useState(initialData?.time ?? "09:00");
  const [workerId, setWorkerId] = useState(initialData?.workerId ?? workers[0]?.id ?? "");
  const [durationMin, setDurationMin] = useState(
    initialData?.durationMin ?? DEFAULT_DURATION_MIN
  );
  const [customerName, setCustomerName] = useState(initialData?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialData?.customerPhone ?? "");
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    if (!initialData?.customerPhone || existingClients.length === 0) return "";
    const normalized = initialData.customerPhone.replace(/\s|-|\(|\)/g, "");
    const found = existingClients.find(
      (c) => c.id === normalized || c.phone.replace(/\s|-|\(|\)/g, "") === normalized
    );
    return found ? found.id : "";
  });

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const worker = useMemo(() => workers.find((w) => w.id === workerId), [workers, workerId]);
  const workerName = worker?.name ?? "";

  const excludeBookingIds = useMemo(() => {
    if (mode !== "edit" || !initialData) return [];
    const ids: string[] = [initialData.phase1Id];
    if (initialData.phase2Id) ids.push(initialData.phase2Id);
    return ids;
  }, [mode, initialData]);

  const startAt = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  }, [date, time]);

  const endAt = useMemo(() => {
    return new Date(startAt.getTime() + durationMin * 60 * 1000);
  }, [startAt, durationMin]);

  const conflict = useMemo(() => {
    return findWorkerConflictFromBookings(
      bookingsForDate,
      workerId,
      date,
      startAt,
      endAt,
      excludeBookingIds
    );
  }, [bookingsForDate, workerId, date, startAt, endAt, excludeBookingIds]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!date.trim()) next.date = "נא לבחור תאריך";
    if (!time.trim()) next.time = "נא לבחור שעה";
    if (!workerId) next.worker = "נא לבחור מטפל";
    const dur = durationMin;
    if (!Number.isFinite(dur) || dur < 1) next.duration = "משך חייב להיות לפחות דקה";
    if (dur > DURATION_MIN_MAX) next.duration = `משך לא יותר מ־${DURATION_MIN_MAX} דקות`;
    if (mode === "create") {
      if (!customerName.trim()) next.customerName = "נא להזין שם לקוח";
      if (!customerPhone.trim()) next.customerPhone = "נא להזין טלפון";
    }
    if (conflict.hasConflict && conflict.conflictingBooking) {
      next.worker = `המטפל כבר תפוס מ־${conflict.conflictingBooking.timeRange}`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [date, time, workerId, durationMin, mode, customerName, customerPhone, conflict]);

  const buildCreatePayload = useCallback((): AdminBookingPayload => {
    return {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      date,
      time,
      phase1: {
        serviceName: "תור",
        serviceTypeId: null,
        serviceType: null,
        workerId,
        workerName,
        durationMin: Math.max(1, Math.min(DURATION_MIN_MAX, durationMin)),
        serviceColor: null,
      },
      phase2: null,
      note: null,
      status: "confirmed",
      price: null,
    };
  }, [customerName, customerPhone, date, time, workerId, workerName, durationMin]);

  const buildEditPayload = useCallback((): AdminBookingPayload => {
    if (!initialData) throw new Error("Edit mode requires initialData");
    return {
      customerName: initialData.customerName,
      customerPhone: initialData.customerPhone,
      date,
      time,
      phase1: {
        serviceName: initialData.phase1.serviceName,
        serviceTypeId: initialData.phase1.serviceTypeId ?? null,
        serviceType: initialData.phase1.serviceType ?? null,
        workerId,
        workerName,
        durationMin: Math.max(1, Math.min(DURATION_MIN_MAX, durationMin)),
        serviceColor: initialData.phase1.serviceColor ?? null,
      },
      phase2: initialData.phase2
        ? {
            enabled: initialData.phase2.enabled,
            serviceName: initialData.phase2.serviceName,
            waitMinutes: initialData.phase2.waitMinutes,
            durationMin: initialData.phase2.durationMin,
            workerIdOverride: initialData.phase2.workerId,
            workerNameOverride: initialData.phase2.workerName,
          }
        : null,
      note: initialData.note ?? null,
      status: (initialData.status as "confirmed" | "cancelled" | "active") ?? "confirmed",
      price: initialData.price ?? null,
    };
  }, [initialData, date, time, workerId, workerName, durationMin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        await createAdminBooking(siteId, buildCreatePayload());
      } else if (initialData) {
        await updateAdminBooking(
          siteId,
          initialData.phase1Id,
          initialData.phase2Id,
          buildEditPayload()
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

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    if (clientId) {
      const c = existingClients.find((x) => x.id === clientId);
      if (c) {
        setCustomerName(c.name);
        setCustomerPhone(c.phone);
      }
    }
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      dir="rtl"
    >
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">
          {mode === "create" ? "הוספת תור" : "עריכת תור"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-slate-100 rounded"
          aria-label="סגור"
        >
          <X className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

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
          <label className="block text-sm font-medium text-slate-700 mb-1">שעת התחלה *</label>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {errors.time && <p className="text-xs text-red-600 mt-0.5">{errors.time}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מטפל *</label>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {errors.worker && <p className="text-xs text-red-600 mt-0.5">{errors.worker}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">משך (דקות) *</label>
          <input
            type="number"
            min={1}
            max={DURATION_MIN_MAX}
            value={durationMin}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) setDurationMin(Math.max(1, Math.min(DURATION_MIN_MAX, n)));
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
          />
          {errors.duration && <p className="text-xs text-red-600 mt-0.5">{errors.duration}</p>}
        </div>

        {mode === "create" && (
          <>
            {existingClients.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  בחר לקוח קיים
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
                >
                  <option value="">— הזן ידנית —</option>
                  {existingClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">שם לקוח *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (e.target.value) setSelectedClientId("");
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                placeholder="שם מלא"
              />
              {errors.customerName && (
                <p className="text-xs text-red-600 mt-0.5">{errors.customerName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">טלפון *</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  if (e.target.value) setSelectedClientId("");
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                placeholder="טלפון"
              />
              {errors.customerPhone && (
                <p className="text-xs text-red-600 mt-0.5">{errors.customerPhone}</p>
              )}
            </div>
          </>
        )}

        {mode === "edit" && initialData && (
          <div className="text-sm text-slate-600 border-t border-slate-200 pt-3">
            <p>
              <span className="font-medium">לקוח:</span> {initialData.customerName} —{" "}
              {initialData.customerPhone}
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? "שומר…" : "שמור"}
          </button>
        </div>
      </form>
    </div>
  );
}
