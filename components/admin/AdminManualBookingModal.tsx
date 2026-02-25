"use client";

import { useState, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import DurationMinutesStepper from "@/components/admin/DurationMinutesStepper";
import { createAdminBooking } from "@/lib/adminBookings";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";

interface BookingRow {
  id: string;
  serviceTypeKey: string;
  date: string;
  time: string;
  durationMin: number;
  workerId: string;
}

function getPricingItemsForService(
  pricingItems: PricingItem[],
  service: SiteService
): PricingItem[] {
  const sid = (service.id || service.name || "").trim();
  const sname = (service.name || "").trim();
  if (!sid && !sname) return [];
  return pricingItems.filter((item) => {
    const itemSid = (item.serviceId || item.service || "").trim();
    return itemSid === sid || itemSid === sname;
  });
}

/** Flatten to (service, pricingItem) options for dropdown. */
function getServiceTypeOptions(
  services: SiteService[],
  pricingItems: PricingItem[]
): Array<{ service: SiteService; pricingItem: PricingItem; label: string }> {
  const out: Array<{ service: SiteService; pricingItem: PricingItem; label: string }> = [];
  for (const service of services) {
    const items = getPricingItemsForService(pricingItems, service);
    for (const item of items) {
      const dur = item.durationMaxMinutes ?? item.durationMinMinutes ?? 30;
      const typeLabel = item.type?.trim() ? `${item.type} — ${dur} דק׳` : `${dur} דק׳`;
      out.push({
        service,
        pricingItem: item,
        label: `${service.name} — ${typeLabel}`,
      });
    }
  }
  return out;
}

export interface AdminManualBookingModalProps {
  siteId: string;
  defaultDate: string;
  workers: Array<{ id: string; name: string }>;
  services: SiteService[];
  pricingItems: PricingItem[];
  /** Client from the parent add-booking card; no client selection in this modal. */
  customerName: string;
  customerPhone: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Admin-only manual booking: one or more bookings per client.
 * Each row: service type, date, time, duration, worker. No automatic followups.
 *
 * DEV VERIFICATION: This flow always calls createAdminBooking with phase2: null.
 */
const NO_CLIENT_MESSAGE = "נא להזין שם וטלפון של הלקוח בכרטיס הוסף תור לפני הרכבת תור.";

export default function AdminManualBookingModal({
  siteId,
  defaultDate,
  workers,
  services,
  pricingItems,
  customerName,
  customerPhone,
  onSuccess,
  onCancel,
}: AdminManualBookingModalProps) {
  const options = getServiceTypeOptions(services, pricingItems);
  const rowIdRef = useRef(1);

  const [rows, setRows] = useState<BookingRow[]>(() => [
    {
      id: "row-0",
      serviceTypeKey: "",
      date: defaultDate,
      time: "09:00",
      durationMin: 30,
      workerId: "",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasClient = !!(customerName?.trim() && customerPhone?.trim());

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      {
        id: `row-${rowIdRef.current++}`,
        serviceTypeKey: "",
        date: last?.date ?? defaultDate,
        time: last?.time ?? "09:00",
        durationMin: last?.durationMin ?? 30,
        workerId: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<BookingRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerName?.trim() || !customerPhone?.trim()) {
      setError(NO_CLIENT_MESSAGE);
      return;
    }
    const invalidRow = rows.find(
      (r) =>
        !r.serviceTypeKey.trim() ||
        !r.workerId.trim() ||
        !r.date ||
        !r.time
    );
    if (invalidRow) {
      setError("נא למלא שירות, מטפל, תאריך ושעה לכל תור.");
      return;
    }
    setSaving(true);
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const selectedOption = options.find(
          (o) => `${o.service.id ?? o.service.name}-${o.pricingItem.id}` === row.serviceTypeKey
        );
        const worker = workers.find((w) => w.id === row.workerId);
        if (!selectedOption || !worker) {
          setError(`תור ${i + 1}: נא לבחור שירות ומטפל.`);
          return;
        }
        await createAdminBooking(siteId, {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          date: row.date,
          time: row.time,
          phase1: {
            serviceName: selectedOption.service.name,
            serviceTypeId: selectedOption.pricingItem.id,
            serviceType: selectedOption.pricingItem.type ?? null,
            workerId: worker.id,
            workerName: worker.name,
            durationMin: row.durationMin,
            serviceColor: selectedOption.service.color ?? null,
            serviceId: selectedOption.service.id ?? null,
          },
          phase2: null,
          note: null,
          notes: null,
          status: "booked",
          price: null,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת התור");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[110]"
      dir="rtl"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">הוסף תור ידנית</h3>
          <button type="button" onClick={onCancel} className="p-1 hover:bg-slate-100 rounded" aria-label="סגור">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed pb-1">
            הרכבת תור מלאה ידנית: בוחרים שירות, תאריך, שעה, משך ומטפל לכל תור. אין שירותי המשך אוטומטיים — אם צריך המשך, מוסיפים תור נוסף. הלקוח נלקח מכרטיס הוסף תור.
          </p>
          {!hasClient && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-right text-sm text-amber-800">
              {NO_CLIENT_MESSAGE}
            </div>
          )}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right text-sm text-red-700">
              {error}
            </div>
          )}

          {rows.map((row, index) => (
            <div key={row.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600">תור {index + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="p-1 text-slate-500 hover:text-red-600 rounded"
                    aria-label="הסר תור"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">בחירת סוג שירות *</label>
                <select
                  value={row.serviceTypeKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    const opt = options.find((o) => `${o.service.id ?? o.service.name}-${o.pricingItem.id}` === key);
                    updateRow(row.id, {
                      serviceTypeKey: key,
                      durationMin: opt ? (opt.pricingItem.durationMaxMinutes ?? opt.pricingItem.durationMinMinutes ?? 30) : row.durationMin,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
                  required
                >
                  <option value="">בחר שירות וסוג</option>
                  {options.map((o) => (
                    <option key={`${o.service.id ?? o.service.name}-${o.pricingItem.id}`} value={`${o.service.id ?? o.service.name}-${o.pricingItem.id}`}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תאריך *</label>
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(row.id, { date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שעת התחלה *</label>
                  <input
                    type="time"
                    value={row.time}
                    onChange={(e) => updateRow(row.id, { time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">משך (דקות) *</label>
                <DurationMinutesStepper
                  value={row.durationMin}
                  onChange={(n) => updateRow(row.id, { durationMin: n })}
                  min={15}
                  max={480}
                  className="w-full px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מטפל *</label>
                <select
                  value={row.workerId}
                  onChange={(e) => updateRow(row.id, { workerId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
                  required
                >
                  <option value="">בחר מטפל</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 text-slate-600 hover:border-caleno-400 hover:text-caleno-600 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסף עוד
          </button>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                !hasClient ||
                rows.some((r) => !r.serviceTypeKey.trim() || !r.workerId.trim())
              }
              className="px-4 py-2 bg-caleno-500 text-white rounded-lg hover:bg-caleno-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "שומר…" : rows.length === 1 ? "שמור תור" : `שמור ${rows.length} תורים`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
