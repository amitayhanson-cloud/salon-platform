"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { X, GripVertical, Trash2, Plus } from "lucide-react";
import { createAdminBooking } from "@/lib/adminBookings";
import { saveMultiServiceBooking } from "@/lib/booking";
import {
  resolveChainWorkers,
  computeChainSlots,
  getChainTotalDuration,
  repairInvalidAssignments,
  validateChainAssignments,
  computeAvailableSlots,
  buildChainWithFinishingService,
  type ChainServiceInput,
} from "@/lib/multiServiceChain";
import { getWorkerBusyIntervals, overlaps } from "@/lib/bookingPhases";
import { resolvePhase2Worker } from "@/lib/phase2Assignment";
import {
  workersWhoCanPerformServiceForService,
  workerCanDoServiceForService,
} from "@/lib/workerServiceCompatibility";
import { minutesToTime } from "@/lib/calendarUtils";
import { subscribeBookingSettings } from "@/lib/firestoreBookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";

const SLOT_MINUTES = 15;
const SLOT_INTERVAL = 15;

type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getWeekdayKey(dayIndex: number): Weekday {
  const mapping: Record<number, Weekday> = {
    0: "sun",
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
  };
  return mapping[dayIndex] ?? "sun";
}

export interface ServiceSlot {
  id: string;
  service: SiteService;
  pricingItem: PricingItem;
}

export interface AdminCreateBookingFormProps {
  siteId: string;
  defaultDate: string;
  workers: Array<{
    id: string;
    name: string;
    services?: string[];
    availability?: { day: string; open: string | null; close: string | null }[];
  }>;
  services: SiteService[];
  pricingItems: PricingItem[];
  existingClients?: Array<{ id: string; name: string; phone: string }>;
  bookingsForDate: Array<{
    id: string;
    workerId?: string | null;
    date?: string;
    dateStr?: string;
    time?: string;
    timeHHmm?: string;
    durationMin?: number;
    phase?: 1 | 2;
    parentBookingId?: string | null;
    status?: string;
    startAt?: Date | { toDate: () => Date };
    endAt?: Date | { toDate: () => Date };
    waitMin?: number;
    waitMinutes?: number;
    secondaryDurationMin?: number;
    secondaryWorkerId?: string | null;
  }>;
  onSuccess: () => void;
  onCancel: () => void;
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
    if (!itemSid) return false;
    return itemSid === sid || itemSid === sname;
  });
}

/** Find first (service, pricingItem) pair from data. Tries services first, then pricing items. */
function getFirstServicePricingPair(
  services: SiteService[],
  pricingItems: PricingItem[]
): { service: SiteService; pricingItem: PricingItem } | null {
  for (const svc of services) {
    const items = getPricingItemsForService(pricingItems, svc);
    if (items.length > 0) return { service: svc, pricingItem: items[0]! };
  }
  for (const item of pricingItems) {
    const itemSid = (item.serviceId || item.service || "").trim();
    if (!itemSid) continue;
    const svc = services.find(
      (s) => (s.id || "").trim() === itemSid || (s.name || "").trim() === itemSid
    );
    if (svc) return { service: svc, pricingItem: item };
  }
  return null;
}

export default function AdminCreateBookingForm({
  siteId,
  defaultDate,
  workers,
  services,
  pricingItems,
  existingClients = [],
  bookingsForDate,
  onSuccess,
  onCancel,
}: AdminCreateBookingFormProps) {
  const [bookingSettings, setBookingSettings] = useState(defaultBookingSettings);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [workerId, setWorkerId] = useState<string>(""); // empty = auto-assign
  const [timeUpdatedByWorkerMessage, setTimeUpdatedByWorkerMessage] = useState(false);
  const slotIdRef = useRef(0);
  const [slots, setSlots] = useState<ServiceSlot[]>([]);

  const nextSlotId = useCallback(() => {
    slotIdRef.current += 1;
    return `slot-${slotIdRef.current}`;
  }, []);

  // Populate default slot when services/pricingItems load
  useEffect(() => {
    if (slots.length > 0) return;
    const pair = getFirstServicePricingPair(services, pricingItems);
    if (pair) {
      setSlots([{ id: nextSlotId(), service: pair.service, pricingItem: pair.pricingItem }]);
    }
  }, [services, pricingItems, slots.length, nextSlotId]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeBookingSettings(
      siteId,
      (s) => setBookingSettings(s),
      (e) => console.error("[AdminCreateBookingForm] Booking settings error", e)
    );
    return () => unsub?.();
  }, [siteId]);

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

  const addService = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setSlots((prev) => {
        const pair =
          prev.length > 0 && prev[prev.length - 1]?.service && prev[prev.length - 1]?.pricingItem
            ? {
                service: prev[prev.length - 1]!.service,
                pricingItem: prev[prev.length - 1]!.pricingItem,
              }
            : getFirstServicePricingPair(services, pricingItems);
        if (pair) {
          return [...prev, { id: nextSlotId(), service: pair.service, pricingItem: pair.pricingItem }];
        }
        return prev;
      });
    },
    [services, pricingItems, nextSlotId]
  );

  const removeSlot = (idx: number) => {
    if (slots.length <= 1) return;
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

  const updateSlot = (idx: number, serviceId: string, pricingItemId: string) => {
    const svc = services.find((s) => s.id === serviceId || s.name === serviceId);
    const item = pricingItems.find((p) => p.id === pricingItemId);
    if (!svc || !item) return;
    setSlots((prev) => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx]!, id: arr[idx]!.id, service: svc, pricingItem: item };
      return arr;
    });
  };

  const selectedDate = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }, [date]);

  const workerWindowByWorkerId = useMemo(() => {
    const out: Record<string, { startMin: number; endMin: number } | null> = {};
    const dayKey = getWeekdayKey(selectedDate.getDay());
    for (const w of workers) {
      const dayConfig = w.availability?.find(
      (a) => a.day === dayKey || a.day === String(selectedDate.getDay())
    );
      if (dayConfig?.open && dayConfig?.close) {
        out[w.id] = {
          startMin: timeToMinutes(dayConfig.open),
          endMin: timeToMinutes(dayConfig.close),
        };
      } else {
        out[w.id] = null;
      }
    }
    return out;
  }, [workers, selectedDate]);

  const businessWindow = useMemo(() => {
    const dayKey = String(selectedDate.getDay()) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
    const dayConfig = bookingSettings.days[dayKey];
    if (!dayConfig?.enabled || !dayConfig.start || !dayConfig.end) return null;
    return {
      startMin: timeToMinutes(dayConfig.start),
      endMin: timeToMinutes(dayConfig.end),
    };
  }, [bookingSettings, selectedDate]);

  const chain: ChainServiceInput[] = useMemo(
    () =>
      buildChainWithFinishingService(
        slots.map((s) => ({ service: s.service, pricingItem: s.pricingItem })),
        services,
        pricingItems
      ),
    [slots, services, pricingItems]
  );

  // Workers eligible for the first (phase 1) service only — used for dropdown and slot validity (no availability here)
  const eligibleWorkersForMainService = useMemo(() => {
    if (chain.length === 0) return workers;
    const firstService = chain[0]!.service;
    return workersWhoCanPerformServiceForService(workers, {
      id: firstService.id,
      name: firstService.name,
      displayName: (firstService as { displayName?: string }).displayName,
    });
  }, [chain, workers]);

  // TODO: Remove TEMP debug block and workerEligibilityDebug UI once eligibility is verified in production
  // TEMP debug: worker eligibility
  const workerEligibilityDebug =
    process.env.NODE_ENV === "development" &&
    chain.length > 0 &&
    (() => {
      const firstService = chain[0]!.service;
      const serviceKey = {
        serviceId: firstService.id,
        serviceName: firstService.name,
        categoryId: (firstService as { category?: string }).category,
      };
      const first10 = workers.slice(0, 10).map((w) => {
        const allowedRaw = (w as { services?: unknown[] }).services ?? [];
        const canDo = workerCanDoServiceForService(w, {
          id: firstService.id,
          name: firstService.name,
          displayName: (firstService as { displayName?: string }).displayName,
        });
        return {
          workerId: w.id,
          workerName: w.name,
          allowedServicesRaw: JSON.stringify(allowedRaw),
          workerCanDoService: canDo,
        };
      });
      if (typeof console !== "undefined" && console.table) {
        console.log("[AdminCreateBooking] Worker eligibility — service key:", serviceKey);
        console.log("[AdminCreateBooking] Workers loaded:", workers.length, "Eligible:", eligibleWorkersForMainService.length);
        console.table(first10);
      }
      return {
        workersLoaded: workers.length,
        workersEligible: eligibleWorkersForMainService.length,
        serviceKeyUsed: `${serviceKey.serviceId ?? ""}|${serviceKey.serviceName ?? ""}`.trim() || "(empty)",
      };
    })();

  // Clear selected worker when they become ineligible (e.g. first service changed)
  useEffect(() => {
    if (chain.length === 0 || !workerId) return;
    const isEligible = eligibleWorkersForMainService.some((w) => w.id === workerId);
    if (!isEligible) {
      setWorkerId("");
      setErrors((prev) => ({ ...prev, worker: "העובד שנבחר לא מבצע את השירות הזה" }));
    }
  }, [chain, workerId, eligibleWorkersForMainService]);

  const availableTimeSlots = useMemo(() => {
    if (chain.length === 0 || !businessWindow) return [];

    // If a worker is selected, they must be eligible for the first service
    if (workerId && chain.length >= 1) {
      const isEligible = eligibleWorkersForMainService.some((w) => w.id === workerId);
      if (!isEligible) return [];
    }

    const dayKey = String(selectedDate.getDay()) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
    const dayConfig = bookingSettings.days[dayKey];
    if (!dayConfig?.enabled) return [];

    const openMin = businessWindow.startMin;
    const closeMin = businessWindow.endMin;
    const totalDuration = getChainTotalDuration(chain);
    const lastStartMin = closeMin - totalDuration;
    if (lastStartMin < openMin) return [];

    const generated: string[] = [];
    for (let m = openMin; m <= lastStartMin; m += SLOT_INTERVAL) {
      generated.push(minutesToTime(m));
    }

    const dateStr = date;

    const isSlotWithinWindows = (
      slotStartMin: number,
      slotEndMin: number,
      bw: { startMin: number; endMin: number },
      ww: { startMin: number; endMin: number } | null
    ) => {
      if (!ww) return slotStartMin >= bw.startMin && slotEndMin <= bw.endMin;
      const effectiveStart = Math.max(bw.startMin, ww.startMin);
      const effectiveEnd = Math.min(bw.endMin, ww.endMin);
      return slotStartMin >= effectiveStart && slotEndMin <= effectiveEnd;
    };

    const doesSlotConflict = (
      slotStartMin: number,
      slotEndMin: number,
      wid: string
    ) => {
      const busy = getWorkerBusyIntervals(bookingsForDate, wid, dateStr);
      return busy.some((iv) => overlaps(slotStartMin, slotEndMin, iv.startMin, iv.endMin));
    };

    const preferredWorkerId = !workerId || workerId.trim() === "" ? null : workerId;
    const slots = computeAvailableSlots({
      date: selectedDate,
      dateStr,
      chain,
      preferredWorkerId,
      workers,
      bookingsForDate,
      workerWindowByWorkerId,
      businessWindow,
      candidateTimes: generated,
    });

    if (process.env.NODE_ENV === "development") {
      const serviceKey = chain.map((s) => s.service?.id ?? s.service?.name ?? "").join(",");
      console.log("recomputeSlots", { workerId: workerId || null, date, serviceKey, slotsCount: slots.length });
    }
    return slots;
  }, [
    chain,
    date,
    selectedDate,
    bookingSettings,
    businessWindow,
    workerId,
    workers,
    workerWindowByWorkerId,
    bookingsForDate,
    eligibleWorkersForMainService,
  ]);

  const totalDuration = useMemo(() => getChainTotalDuration(chain), [chain]);

  const timeOptions = availableTimeSlots.length > 0 ? availableTimeSlots : [""];

  // When worker (or date/slots) changes, clear selected time if it's no longer valid and show inline message
  useEffect(() => {
    if (availableTimeSlots.length === 0 || !time) return;
    if (availableTimeSlots.includes(time)) return;
    setTime(availableTimeSlots[0]!);
    setTimeUpdatedByWorkerMessage(true);
  }, [workerId, availableTimeSlots, time]);

  const previewSlots = useMemo(() => {
    if (chain.length === 0) return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const startAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
    const rawSlots = computeChainSlots(chain, startAt);

    if (chain.length === 1) {
      const resolved = resolveChainWorkers({
        chain,
        startAt,
        dateStr: date,
        workers,
        bookingsForDate,
        preferredWorkerId: workerId || null,
        workerWindowByWorkerId,
        businessWindow,
      });
      return resolved;
    }
    return resolveChainWorkers({
      chain,
      startAt,
      dateStr: date,
      workers,
      bookingsForDate,
      preferredWorkerId: workerId || null,
      workerWindowByWorkerId,
      businessWindow,
    });
  }, [
    chain,
    date,
    time,
    workerId,
    workers,
    bookingsForDate,
    workerWindowByWorkerId,
    businessWindow,
  ]);

  const formatTime = (d: Date) =>
    `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!date.trim()) next.date = "נא לבחור תאריך";
    if (!time.trim()) next.time = "נא לבחור שעה";
    if (!customerName.trim()) next.customerName = "נא להזין שם לקוח";
    if (!customerPhone.trim()) next.customerPhone = "נא להזין טלפון";
    if (slots.length === 0) next.services = "נא לבחור לפחות שירות אחד";
    if (slots.some((s) => !s.service || !s.pricingItem)) next.services = "כל שירות חייב להיות תקין";
    // workerId can be empty = "ללא העדפה"; resolution will assign eligible workers per service
    if (previewSlots === null && chain.length > 0) {
      next.worker = "אין זמינות להשלמת התור. נא לשנות מטפל או שעה.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [date, time, customerName, customerPhone, slots, chain.length, workerId, previewSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError(null);
    setSaving(true);
    try {
      const [y, m, d] = date.split("-").map(Number);
      const [hh, mm] = time.split(":").map(Number);
      const startAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);

      if (chain.length === 1 && workerId) {
        const { service, pricingItem } = chain[0]!;
        const durationMin = pricingItem.durationMaxMinutes ?? pricingItem.durationMinMinutes ?? 30;
        const hasFollowUp =
          pricingItem.hasFollowUp === true &&
          pricingItem.followUp?.name?.trim() &&
          (pricingItem.followUp?.durationMinutes ?? 0) >= 1;

        const worker = workers.find((w) => w.id === workerId);
        if (!worker) throw new Error("נא לבחור מטפל");

        let phase2Payload: { enabled: true; serviceName: string; waitMinutes: number; durationMin: number; workerIdOverride?: string; workerNameOverride?: string; serviceColor?: string | null; serviceId?: string | null } | null = null;
        if (hasFollowUp && pricingItem.followUp) {
          const slotStartMin = timeToMinutes(time);
          const phase2Worker = resolvePhase2Worker({
            phase1Worker: { id: worker.id, name: worker.name },
            preferredWorkerId: worker.id,
            dateStr: date,
            phase1StartMinutes: slotStartMin,
            phase1DurationMin: durationMin,
            waitMin: Math.max(0, pricingItem.followUp.waitMinutes ?? 0),
            phase2DurationMin: pricingItem.followUp.durationMinutes,
            phase2ServiceName: pricingItem.followUp.name.trim(),
            phase2ServiceId: pricingItem.followUp.serviceId ?? undefined,
            workers,
            bookingsForDate,
            workerWindowByWorkerId,
            businessWindow: businessWindow ?? undefined,
          });
          if (!phase2Worker) {
            throw new Error("אין עובד זמין לשירות ההמשך. נא לנסות שעה או מטפל אחר.");
          }
          const followUpService = services.find(
            (s) => s.id === pricingItem.followUp?.serviceId || s.name === pricingItem.followUp?.name?.trim()
          );
          phase2Payload = {
            enabled: true,
            serviceName: pricingItem.followUp.name.trim(),
            waitMinutes: pricingItem.followUp.waitMinutes ?? 0,
            durationMin: pricingItem.followUp.durationMinutes,
            workerIdOverride: phase2Worker.id,
            workerNameOverride: phase2Worker.name,
            serviceColor: followUpService?.color ?? null,
            serviceId: followUpService?.id ?? null,
          };
        }

        await createAdminBooking(siteId, {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          date,
          time,
          phase1: {
            serviceName: service.name,
            serviceTypeId: pricingItem.id,
            serviceType: pricingItem.type ?? null,
            workerId: worker.id,
            workerName: worker.name,
            durationMin,
            serviceColor: service.color ?? null,
            serviceId: service.id ?? null,
          },
          phase2: phase2Payload,
          note: null,
          status: "confirmed",
          price: null,
        });
      } else if (chain.length === 1 && !workerId) {
        // "ללא העדפה": resolve at selected time, then save multi-service (never store preferredWorkerId in DB)
        const resolved = resolveChainWorkers({
          chain,
          startAt,
          dateStr: date,
          workers,
          bookingsForDate,
          preferredWorkerId: null,
          workerWindowByWorkerId,
          businessWindow,
        });
        if (!resolved) throw new Error("אין זמינות להשלמת התור. נא לנסות שעה אחרת.");
        const repaired = repairInvalidAssignments(resolved, workers, {
          dateStr: date,
          bookingsForDate,
          workerWindowByWorkerId,
          businessWindow,
        });
        if (!repaired) throw new Error("אין עובד זמין לאחד השירותים. נא לנסות שעה או מטפל אחר.");
        const validation = validateChainAssignments(repaired, workers);
        if (!validation.valid) throw new Error(validation.errors[0] ?? "ההקצאה אינה תקינה");
        await saveMultiServiceBooking(siteId, repaired, {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          note: undefined,
        }, { workers });
      } else if (previewSlots && previewSlots.length > 0) {
        const repaired = repairInvalidAssignments(previewSlots, workers, {
          dateStr: date,
          bookingsForDate,
          workerWindowByWorkerId,
          businessWindow,
        });
        if (!repaired) {
          throw new Error("אין עובד זמין לאחד השירותים. נא לנסות שעה או מטפל אחר.");
        }
        const validation = validateChainAssignments(repaired, workers);
        if (!validation.valid) {
          throw new Error(validation.errors[0] ?? "ההקצאה אינה תקינה");
        }
        await saveMultiServiceBooking(siteId, repaired, {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          note: undefined,
        }, { workers });
      } else {
        throw new Error("אין זמינות להשלמת התור");
      }
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-create-booking-title"
      className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto relative"
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <h3 id="admin-create-booking-title" className="text-lg font-bold text-slate-900">הוסף תור</h3>
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

        {/* Customer */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">לקוח</h4>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">שם *</label>
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
        </div>

        {/* Services */}
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-slate-700">שירותים</h4>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addService(e);
              }}
              className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 rounded px-2 py-1 -m-1 min-h-[32px]"
            >
              <Plus className="w-4 h-4" />
              הוסף שירות
            </button>
          </div>
          {slots.length === 0 ? (
            getFirstServicePricingPair(services, pricingItems) ? (
              <div
                role="button"
                tabIndex={0}
                onClick={addService}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    addService();
                  }
                }}
                className="p-4 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-sky-300 cursor-pointer text-center text-sm text-slate-600"
              >
                <Plus className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                <p>לחץ לבחירת שירות</p>
                <p className="text-xs mt-1 text-slate-500">או השתמש בכפתור למעלה</p>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-slate-200 bg-amber-50 text-center text-sm text-amber-800">
                <p>לא הוגדרו שירותים או מחירים.</p>
                <p className="text-xs mt-1">נא להגדיר שירותים ומחירים בהגדרות לפני הוספת תור.</p>
              </div>
            )
          ) : (
            <ul className="space-y-2">
              {slots.map((slot, idx) => {
                const itemsForService = getPricingItemsForService(pricingItems, slot.service);
                return (
                  <li
                    key={slot.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">שירות {idx + 1}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveSlot(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-40"
                          aria-label="העבר למעלה"
                        >
                          <GripVertical className="w-4 h-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSlot(idx, 1)}
                          disabled={idx === slots.length - 1}
                          className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-40"
                          aria-label="העבר למטה"
                        >
                          <GripVertical className="w-4 h-4 -rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSlot(idx)}
                          disabled={slots.length === 1}
                          className="p-1 text-red-600 hover:text-red-700 disabled:opacity-40"
                          aria-label="הסר"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <select
                      value={slot.service.id ?? slot.service.name}
                      onChange={(e) => {
                        const svc = services.find(
                          (s) => s.id === e.target.value || s.name === e.target.value
                        );
                        if (svc) {
                          const items = getPricingItemsForService(pricingItems, svc);
                          const first = items[0];
                          if (first) updateSlot(idx, svc.id ?? svc.name, first.id);
                        }
                      }}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right bg-white"
                    >
                      {services.map((s) => (
                        <option key={s.id ?? s.name} value={s.id ?? s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={slot.pricingItem.id}
                      onChange={(e) =>
                        updateSlot(idx, slot.service.id ?? slot.service.name, e.target.value)
                      }
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right bg-white"
                    >
                      {itemsForService.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.type || item.id} —{" "}
                          {item.durationMaxMinutes ?? item.durationMinMinutes ?? 30} דק׳
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-slate-500">
                      משך: {slot.pricingItem.durationMaxMinutes ?? slot.pricingItem.durationMinMinutes ?? 30} דק׳
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {errors.services && (
            <p className="text-xs text-red-600">{errors.services}</p>
          )}
        </div>

        {/* Worker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מטפל</label>
          <select
            value={workerId}
            onChange={(e) => {
              setWorkerId(e.target.value);
              setErrors((prev) => ({ ...prev, worker: "" }));
              setTimeUpdatedByWorkerMessage(false);
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
          >
            <option value="">ללא העדפה (הקצאה אוטומטית)</option>
            {eligibleWorkersForMainService.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {chain.length === 1 && (
            <p className="text-xs text-slate-500 mt-1">לשירות יחיד יש לבחור מטפל</p>
          )}
          {chain.length >= 1 && eligibleWorkersForMainService.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">אין עובדים שמבצעים את השירות הזה</p>
          )}
          {errors.worker && (
            <p className="text-xs text-red-600 mt-0.5">{errors.worker}</p>
          )}
          {workerEligibilityDebug && (
            <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-left text-xs font-mono" dir="ltr">
              <div>Workers loaded: {workerEligibilityDebug.workersLoaded}</div>
              <div>Workers eligible: {workerEligibilityDebug.workersEligible}</div>
              <div>Service key used: {workerEligibilityDebug.serviceKeyUsed}</div>
            </div>
          )}
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תאריך *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTimeUpdatedByWorkerMessage(false);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
            />
            {errors.date && <p className="text-xs text-red-600 mt-0.5">{errors.date}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שעת התחלה *</label>
            <select
              value={timeOptions.includes(time) ? time : (availableTimeSlots[0] ?? "")}
              onChange={(e) => {
                setTime(e.target.value);
                setTimeUpdatedByWorkerMessage(false);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right bg-white"
            >
              {availableTimeSlots.length === 0 ? (
                <option value="">
                  {workerId ? "אין שעות זמינות לעובד שנבחר" : "אין זמנים זמינים ביום זה"}
                </option>
              ) : (
                timeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t || "—"}
                  </option>
                ))
              )}
            </select>
            {availableTimeSlots.length === 0 && chain.length > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                {workerId ? "אין שעות זמינות לעובד שנבחר" : "בחר תאריך אחר או מטפל אחר"}
              </p>
            )}
            {timeUpdatedByWorkerMessage && (
              <p className="text-xs text-slate-600 mt-0.5">שעת התחלה עודכנה לפי העובד שנבחר</p>
            )}
            {errors.time && <p className="text-xs text-red-600 mt-0.5">{errors.time}</p>}
          </div>
        </div>

        {/* Preview */}
        {previewSlots && previewSlots.length > 0 && (
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">תצוגה מקדימה</h4>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
              <p className="text-slate-600 font-medium">משך כולל: {totalDuration} דק׳</p>
              <ul className="space-y-1">
                {previewSlots.map((s, i) => (
                  <li key={i} className="flex justify-between text-slate-700">
                    <span>
                      {s.serviceName}
                      {s.serviceType ? ` (${s.serviceType})` : ""}
                    </span>
                    <span>
                      {formatTime(s.startAt)} – {formatTime(s.endAt)}
                      {s.workerName && ` • ${s.workerName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
            disabled={saving || (previewSlots === null && chain.length > 0)}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? "שומר…" : "צור תור"}
          </button>
        </div>
      </form>
    </div>
  );
}
