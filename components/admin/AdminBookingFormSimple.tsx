"use client";

import { useState, useMemo, useCallback } from "react";
import { X } from "lucide-react";
import {
  createAdminBooking,
  updatePhase1Only,
  updatePhase2Only,
  type AdminBookingPayload,
} from "@/lib/adminBookings";
import { findWorkerConflictFromBookings } from "@/lib/bookingConflicts";
import DurationMinutesStepper from "@/components/admin/DurationMinutesStepper";
import {
  computeWeeklyOccurrenceDates,
  createRecurringBookings,
  MAX_RECURRING_OCCURRENCES,
  type RecurrenceRule,
} from "@/lib/recurringBookings";

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

const HEBREW_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  /** When 2, we are editing the follow-up (phase 2) slot only; form shows phase 2's date/time/worker/duration. */
  editingPhase?: 1 | 2;
  customerName: string;
  customerPhone: string;
  note?: string | null;
  /** הערות – booking notes (Firestore: notes). */
  notes?: string | null;
  status?: string;
  price?: number | null;
  phase1: {
    serviceName: string;
    serviceTypeId?: string | null;
    serviceType?: string | null;
    serviceColor?: string | null;
    serviceId?: string | null;
  };
  phase2: {
    enabled: boolean;
    serviceName: string;
    waitMinutes: number;
    durationMin: number;
    workerId: string | null;
    workerName: string | null;
    serviceId?: string | null;
    serviceColor?: string | null;
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
  onSuccess: (meta?: {
    createdRecurring?: number;
    failedRecurring?: number;
    failedDetails?: Array<{ date: string; error: string }>;
  }) => void;
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
  const [notes, setNotes] = useState(initialData?.notes ?? initialData?.note ?? "");
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

  // Recurring (create only)
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringMode, setRecurringMode] = useState<"endDate" | "count">("count");
  const defaultRecurringEndDate = useMemo(() => addMonths(date, 3), [date]);
  const [recurringEndDate, setRecurringEndDate] = useState(defaultRecurringEndDate);
  const [recurringCount, setRecurringCount] = useState(10);
  const [recurringProgress, setRecurringProgress] = useState<{ current: number; total: number } | null>(null);
  // Sync recurringEndDate default when date changes
  const occurrences = useMemo(() => {
    if (!recurringEnabled || mode !== "create") return [];
    return computeWeeklyOccurrenceDates(date, time, {
      endDate: recurringMode === "endDate" ? recurringEndDate : undefined,
      count: recurringMode === "count" ? recurringCount : undefined,
      maxOccurrences: MAX_RECURRING_OCCURRENCES,
    });
  }, [recurringEnabled, mode, date, time, recurringMode, recurringEndDate, recurringCount]);
  const recurringValidationError = useMemo(() => {
    if (!recurringEnabled) return null;
    if (recurringMode === "endDate" && recurringEndDate < date)
      return "תאריך סיום חייב להיות אחרי תאריך ההתחלה";
    if (recurringMode === "count" && (recurringCount < 1 || !Number.isInteger(recurringCount)))
      return "מספר חזרות חייב להיות 1 ומעלה";
    if (recurringMode === "count" && recurringCount > MAX_RECURRING_OCCURRENCES)
      return `מקסימום ${MAX_RECURRING_OCCURRENCES} חזרות`;
    if (occurrences.length > MAX_RECURRING_OCCURRENCES)
      return `מקסימום ${MAX_RECURRING_OCCURRENCES} תורים`;
    return null;
  }, [recurringEnabled, recurringMode, date, recurringEndDate, recurringCount, occurrences.length]);
  const weekdayLabel = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    const day = new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
    return HEBREW_WEEKDAYS[day] ?? "";
  }, [date]);

  const worker = useMemo(() => workers.find((w) => w.id === workerId), [workers, workerId]);
  const workerName = worker?.name ?? "";

  const excludeBookingIds = useMemo(() => {
    if (mode !== "edit" || !initialData) return [];
    if (initialData.editingPhase === 2 && initialData.phase2Id) {
      return [initialData.phase2Id];
    }
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
    if (mode === "create" && recurringEnabled && recurringValidationError) {
      next.recurring = recurringValidationError;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [date, time, workerId, durationMin, mode, customerName, customerPhone, conflict, recurringEnabled, recurringValidationError]);

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
      notes: notes.trim() || null,
      status: "booked",
      price: null,
    };
  }, [customerName, customerPhone, date, time, workerId, workerName, durationMin, notes]);

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
        serviceId: initialData.phase1.serviceId ?? null,
      },
      phase2: initialData.phase2
        ? {
            enabled: initialData.phase2.enabled,
            serviceName: initialData.phase2.serviceName,
            waitMinutes: initialData.phase2.waitMinutes,
            durationMin: initialData.phase2.durationMin,
            workerIdOverride: initialData.phase2.workerId,
            workerNameOverride: initialData.phase2.workerName,
            serviceId: initialData.phase2.serviceId ?? null,
            serviceColor: initialData.phase2.serviceColor ?? null,
          }
        : null,
      note: initialData.note ?? null,
      notes: notes.trim() || null,
      status: (initialData.status as "booked" | "confirmed" | "cancelled" | "active") ?? undefined,
      price: initialData.price ?? null,
    };
  }, [initialData, date, time, workerId, workerName, durationMin, notes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError(null);
    setSaving(true);
    setRecurringProgress(null);
    try {
      if (mode === "create") {
        if (recurringEnabled && occurrences.length > 0) {
          const rule: RecurrenceRule = {
            startDate: date,
            time,
            mode: recurringMode,
            endDate: recurringMode === "endDate" ? recurringEndDate : undefined,
            count: recurringMode === "count" ? recurringCount : undefined,
          };
          const { createdIds, failedDates } = await createRecurringBookings(
            siteId,
            buildCreatePayload(),
            rule,
            (current, total) => setRecurringProgress({ current, total })
          );
          setRecurringProgress(null);
          onSuccess({
            createdRecurring: createdIds.length,
            failedRecurring: failedDates.length,
            failedDetails: failedDates.length > 0 ? failedDates.map((f) => ({ date: f.date, error: f.error })) : undefined,
          });
        } else {
          await createAdminBooking(siteId, buildCreatePayload());
          onSuccess();
        }
      } else if (initialData) {
        if (initialData.editingPhase === 2 && initialData.phase2Id) {
          await updatePhase2Only(siteId, initialData.phase2Id, {
            date,
            time,
            workerId,
            workerName,
            durationMin: Math.max(1, Math.min(DURATION_MIN_MAX, durationMin)),
          });
        } else {
          // Edit phase 1 only: do not update phase 2 or any related booking.
          await updatePhase1Only(siteId, initialData.phase1Id, buildEditPayload());
        }
        onSuccess();
      }
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
    } else {
      setCustomerName("");
      setCustomerPhone("");
    }
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      dir="rtl"
    >
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center gap-2">
        <h3 className="text-lg font-bold text-slate-900 truncate">
            {mode === "create"
              ? "הוספת תור"
              : initialData?.editingPhase === 2
                ? "עריכת תור שלב 2 (המשך)"
                : "עריכת תור"}
            </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-slate-100 rounded shrink-0"
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

        {mode === "create" && (
          <label className="flex items-center gap-2 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={recurringEnabled}
              onChange={(e) => setRecurringEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-caleno-500 shrink-0"
            />
            <span className="text-sm font-medium text-slate-700">רצף</span>
          </label>
        )}

        {mode === "create" && recurringEnabled && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-3">
            <p className="text-xs text-slate-500">כל שבוע, יום {weekdayLabel} בשעה {time}</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="recurringMode"
                  checked={recurringMode === "count"}
                  onChange={() => setRecurringMode("count")}
                  className="text-caleno-500"
                />
                <span className="text-sm">מספר חזרות</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="recurringMode"
                  checked={recurringMode === "endDate"}
                  onChange={() => setRecurringMode("endDate")}
                  className="text-caleno-500"
                />
                <span className="text-sm">תאריך סיום</span>
              </label>
            </div>
            {recurringMode === "count" ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מספר חזרות</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_RECURRING_OCCURRENCES}
                  value={recurringCount}
                  onChange={(e) => setRecurringCount(Math.max(1, Math.min(MAX_RECURRING_OCCURRENCES, parseInt(e.target.value, 10) || 1)))}
                  className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-right"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תאריך סיום</label>
                <input
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  min={date}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
            )}
            {occurrences.length > 0 && (
              <div className="text-sm text-slate-700 pt-1 border-t border-slate-200">
                <p className="font-medium">ייווצרו {occurrences.length} תורים</p>
                <p className="text-xs text-slate-500">
                  מ־{date} עד {recurringMode === "endDate" ? recurringEndDate : occurrences[occurrences.length - 1]?.date ?? date}, כל יום {weekdayLabel} בשעה {time}
                </p>
              </div>
            )}
            {errors.recurring && <p className="text-xs text-red-600">{errors.recurring}</p>}
          </div>
        )}

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
          <DurationMinutesStepper
            value={durationMin}
            onChange={(n) => setDurationMin(Math.max(0, Math.min(DURATION_MIN_MAX, n)))}
            min={0}
            max={DURATION_MIN_MAX}
            className="w-full px-3 py-2"
          />
          {errors.duration && <p className="text-xs text-red-600 mt-0.5">{errors.duration}</p>}
        </div>

        {mode === "create" && (
          <>
            {existingClients.length > 0 && (
              <div>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
                  aria-label="בחר לקוח"
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הוסף/י הערות להזמנה..."
            maxLength={1000}
            className="w-full min-h-[72px] px-3 py-2 border border-slate-300 rounded-lg text-right placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-caleno-500"
            dir="rtl"
          />
          <p className="text-xs text-slate-500 mt-0.5">{1000 - notes.length} תווים נותרים</p>
        </div>

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
            className="px-4 py-2 bg-caleno-500 text-white rounded-lg hover:bg-caleno-600 disabled:opacity-50"
          >
            {recurringProgress
              ? `יוצר ${recurringProgress.current}/${recurringProgress.total}…`
              : saving
                ? "שומר…"
                : "שמור"}
          </button>
        </div>
      </form>
    </div>
  );
}
