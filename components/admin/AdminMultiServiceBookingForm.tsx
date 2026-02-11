"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createAdminMultiServiceVisit } from "@/lib/adminBookings";

const SLOT_MINUTES = 15;
const DEFAULT_DURATION = 60;

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

export interface AdminMultiServiceSlot {
  serviceName: string;
  durationMin: number;
  workerId: string;
  workerName: string;
}

export interface AdminMultiServiceBookingFormProps {
  siteId: string;
  defaultDate: string;
  workers: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string }>;
  existingClients?: Array<{ id: string; name: string; phone: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminMultiServiceBookingForm({
  siteId,
  defaultDate,
  workers,
  services,
  existingClients = [],
  onSuccess,
  onCancel,
}: AdminMultiServiceBookingFormProps) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const defaultService = services[0]?.name ?? "תור";
  const defaultWorkerId = workers[0]?.id ?? "";
  const defaultWorkerName = workers[0]?.name ?? "";
  const [slots, setSlots] = useState<AdminMultiServiceSlot[]>([
    { serviceName: defaultService, durationMin: DEFAULT_DURATION, workerId: defaultWorkerId, workerName: defaultWorkerName },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const addSlot = () => {
    setSlots((prev) => [
      ...prev,
      {
        serviceName: defaultService,
        durationMin: DEFAULT_DURATION,
        workerId: defaultWorkerId,
        workerName: defaultWorkerName,
      },
    ]);
  };

  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveSlot = (idx: number, dir: 1 | -1) => {
    const next = idx + dir;
    if (next < 0 || next >= slots.length) return;
    setSlots((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  };

  const updateSlot = (idx: number, updates: Partial<AdminMultiServiceSlot>) => {
    setSlots((prev) => {
      const arr = [...prev];
      const worker = updates.workerId ? workers.find((w) => w.id === updates.workerId) : null;
      arr[idx] = {
        ...arr[idx]!,
        ...updates,
        workerName: worker?.name ?? arr[idx]!.workerName,
      };
      return arr;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerName.trim() || !customerPhone.trim()) {
      setError("נא להזין שם וטלפון");
      return;
    }
    const validSlots = slots
      .map((s) => ({
        ...s,
        workerId: s.workerId,
        workerName: workers.find((w) => w.id === s.workerId)?.name ?? s.workerName,
      }))
      .filter((s) => s.serviceName.trim() && s.workerId);
    if (validSlots.length === 0) {
      setError("נא להוסיף לפחות שירות אחד עם מטפל");
      return;
    }
    setSaving(true);
    try {
      await createAdminMultiServiceVisit(siteId, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        date,
        time,
        slots: validSlots,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      dir="rtl"
    >
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">ביקור מרובה שירותים</h3>
        <button type="button" onClick={onCancel} className="p-1 hover:bg-slate-100 rounded">
          <X className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{error}</p>
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
        </div>

        {existingClients.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">לקוח קיים</label>
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
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            placeholder="שם מלא"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">טלפון *</label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            placeholder="טלפון"
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm font-medium text-slate-700">שירותים</label>
            <button
              type="button"
              onClick={addSlot}
              className="text-sm text-sky-600 hover:text-sky-700 font-medium"
            >
              + הוסף שירות
            </button>
          </div>
          <ul className="space-y-3">
            {slots.map((slot, idx) => (
              <li
                key={idx}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">שירות {idx + 1}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveSlot(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlot(idx, 1)}
                      disabled={idx === slots.length - 1}
                      className="p-1 text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlot(idx)}
                      disabled={slots.length === 1}
                      className="p-1 text-red-600 text-xs disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <select
                  value={slot.serviceName}
                  onChange={(e) => updateSlot(idx, { serviceName: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right"
                >
                  {services.length === 0 && (
                    <option value="תור">תור</option>
                  )}
                  {services.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  {services.length > 0 && !services.some((s) => s.name === slot.serviceName) && (
                    <option value={slot.serviceName}>{slot.serviceName}</option>
                  )}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={slot.durationMin}
                    onChange={(e) => updateSlot(idx, { durationMin: parseInt(e.target.value, 10) || 30 })}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm text-right"
                  />
                  <span className="text-sm text-slate-500 self-center">דק׳</span>
                  <select
                    value={slot.workerId}
                    onChange={(e) => updateSlot(idx, { workerId: e.target.value })}
                    className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm text-right"
                  >
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
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
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? "שומר…" : "שמור"}
          </button>
        </div>
      </form>
    </div>
  );
}
