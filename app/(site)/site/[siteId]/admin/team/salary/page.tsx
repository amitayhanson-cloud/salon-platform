"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { query, where, orderBy, limit, Timestamp, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import { bookingsCollection, workersCollection } from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { RefreshCw } from "lucide-react";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import { subscribePricingItems } from "@/lib/firestorePricing";
import type { PricingItem } from "@/types/pricingItem";
import { getAllPersonalPricing } from "@/lib/firestorePersonalPricing";
import { catalogRevenuePhase1, catalogRevenuePhase2 } from "@/lib/followUpRevenue";

// Helper to build override key (consistent format: clientId__serviceTypeId)
const overrideKey = (clientId: string, serviceTypeId: string): string => {
  return `${clientId}__${serviceTypeId}`;
};

type PeriodType = "daily" | "monthly";

interface Worker {
  id: string;
  name: string;
  treatmentCommissionPercent?: number;
}

interface Booking {
  id: string;
  workerId: string | null;
  clientId?: string | null; // Phone number (document ID)
  customerPhone?: string | null; // Legacy field (phone number)
  pricingItemId?: string | null; // Service type ID (pricing item ID)
  serviceTypeId?: string | null; // Alias for pricingItemId
  price?: number | null;
  priceApplied?: number | null;
  finalPrice?: number | null; // Alias for priceApplied
  startAt?: any; // Firestore Timestamp
  endAt?: any; // Firestore Timestamp
  durationMin?: number;
  status?: string;
  dateISO?: string;
  date?: string;
  phase?: 1 | 2;
  parentBookingId?: string | null;
}

/** Commission direction: treatmentCommissionPercent = worker's share (0–100). Business gets the remainder. */
interface WorkerMetrics {
  workerId: string;
  workerName: string;
  grossRevenue: number;
  /** Worker's share of revenue (grossRevenue * commissionPercent/100) */
  workerPayout: number;
  /** Business share (grossRevenue * (1 - commissionPercent/100)) */
  businessShare: number;
  totalMinutes: number;
  totalHours: number;
  avgPerHour: number;
}

export default function TeamPerformancePage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [periodType, setPeriodType] = useState<PeriodType>("daily");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today
    const today = new Date();
    return ymdLocal(today);
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // Default to current month
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  const [personalPricingOverrides, setPersonalPricingOverrides] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workers
  useEffect(() => {
    if (!siteId || !db) return;

    const workersQuery = query(workersCollection(siteId), orderBy("name", "asc"));
    const unsubscribe = onSnapshotDebug(
      "salary-workers",
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: (data.name as string) || "",
            treatmentCommissionPercent: data.treatmentCommissionPercent != null ? Number(data.treatmentCommissionPercent) : 0,
          };
        });
        setWorkers(items);
      },
      (err) => {
        console.error("[TeamPerformance] Failed to load workers", err);
        setWorkers([]);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load pricing items (service types) for default prices
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribePricingItems(
      siteId,
      (items) => {
        setPricingItems(items);
      },
      (err) => {
        console.error("[TeamPerformance] Failed to load pricing items", err);
        setPricingItems([]);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Build date range for queries
  const dateRange = useMemo(() => {
    if (periodType === "daily") {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      return { start, end, dateISO: selectedDate };
    } else {
      // Monthly
      const [year, month] = selectedMonth.split("-").map(Number);
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
      return { start, end, dateISO: null };
    }
  }, [periodType, selectedDate, selectedMonth]);

  // Load bookings for selected period
  useEffect(() => {
    if (!siteId || !db) return;

    setLoading(true);
    setError(null);

    const { start, end } = dateRange;
    const startTimestamp = Timestamp.fromDate(start);
    const endTimestamp = Timestamp.fromDate(end);

    // Query bookings in the date range
    // Try querying by startAt first (new format)
    let bookingsQuery;
    try {
      bookingsQuery = query(
        bookingsCollection(siteId),
        where("startAt", ">=", startTimestamp),
        where("startAt", "<=", endTimestamp),
        orderBy("startAt", "asc")
      );
    } catch (e) {
      // If orderBy fails, try without it
      try {
        bookingsQuery = query(
          bookingsCollection(siteId),
          where("startAt", ">=", startTimestamp),
          where("startAt", "<=", endTimestamp)
        );
      } catch (e2) {
        // If that also fails, use dateISO fallback for daily
        if (periodType === "daily") {
          try {
            bookingsQuery = query(
              bookingsCollection(siteId),
              where("dateISO", "==", dateRange.dateISO),
              orderBy("timeHHmm", "asc")
            );
          } catch (e3) {
            bookingsQuery = query(
              bookingsCollection(siteId),
              where("dateISO", "==", dateRange.dateISO)
            );
          }
        } else {
          // For monthly, bounded query then filter client-side by month
          bookingsQuery = query(bookingsCollection(siteId), limit(500));
        }
      }
    }

    const unsubscribe = onSnapshotDebug(
      "salary-bookings",
      bookingsQuery,
      (snapshot) => {
        const items: Booking[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.isArchived === true) return;
          // Filter by status - only include confirmed/completed bookings
          const status = data.status ?? "booked";
          if (status === "cancelled" || status === "canceled" || status === "cancelled_by_salon" || status === "no_show") {
            return;
          }

          // For monthly, also filter by date range client-side
          if (periodType === "monthly") {
            const bookingDate = (data.dateISO || data.date) as string | undefined;
            if (bookingDate) {
              const [y, m] = selectedMonth.split("-").map(Number);
              const [by, bm] = bookingDate.split("-").map(Number);
              if (by !== y || bm !== m) {
                return;
              }
            } else if (data.startAt) {
              const bookingDate = (data.startAt as { toDate: () => Date }).toDate();
              const [y, m] = selectedMonth.split("-").map(Number);
              if (bookingDate.getFullYear() !== y || bookingDate.getMonth() + 1 !== m) {
                return;
              }
            } else {
              return; // Skip if no date info
            }
          }

          // Only include bookings with workerId
          if (!data.workerId) {
            return;
          }

          items.push({
            id: doc.id,
            workerId: (data.workerId as string) || null,
            clientId: (data.clientId as string) || (data.customerPhone as string) || null,
            customerPhone: (data.customerPhone as string) || (data.phone as string) || null,
            pricingItemId: (data.pricingItemId as string) || null,
            serviceTypeId: (data.pricingItemId as string) || (data.serviceTypeId as string) || null,
            price: typeof data.price === "number" ? data.price : null,
            priceApplied: typeof data.priceApplied === "number" ? data.priceApplied : (data.finalPrice as number) ?? null,
            finalPrice: typeof data.priceApplied === "number" ? data.priceApplied : (data.finalPrice as number) ?? null,
            startAt: data.startAt,
            endAt: data.endAt,
            durationMin: typeof data.durationMin === "number" ? data.durationMin : undefined,
            status: (data.status as string) ?? "booked",
            dateISO: (data.dateISO as string) || (data.date as string),
            date: (data.date as string) || (data.dateISO as string),
            phase: data.phase === 2 ? 2 : 1,
            parentBookingId:
              typeof data.parentBookingId === "string" ? data.parentBookingId : null,
          });
        });

        setBookings(items);
        setLoading(false);
      },
      (err) => {
        console.error("[TeamPerformance] Failed to load bookings", err);
        setError("שגיאה בטעינת התורים");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId, dateRange, periodType, selectedMonth]);

  const pricingItemById = useMemo(() => {
    const map = new Map<string, PricingItem>();
    pricingItems.forEach((p) => map.set(p.id, p));
    return map;
  }, [pricingItems]);

  // Build service type price map (שלב 1 catalog for items with follow-up split)
  const serviceTypePriceMap = useMemo(() => {
    const map = new Map<string, number>();
    pricingItems.forEach((item) => {
      const defaultPrice = catalogRevenuePhase1(item);
      map.set(item.id, Number(defaultPrice));
    });
    return map;
  }, [pricingItems]);

  const bookingsById = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach((b) => map.set(b.id, b));
    return map;
  }, [bookings]);

  // Fetch personal pricing overrides for all clients in bookings
  useEffect(() => {
    if (!siteId || bookings.length === 0) {
      setPersonalPricingOverrides(new Map());
      return;
    }

    // Collect unique phone numbers from bookings
    const phoneNumbers = new Set<string>();
    bookings.forEach((booking) => {
      const phone = booking.clientId || booking.customerPhone;
      if (phone) {
        phoneNumbers.add(phone);
      }
    });

    if (phoneNumbers.size === 0) {
      setPersonalPricingOverrides(new Map());
      return;
    }

    // Fetch personal pricing for all clients (in parallel, but in chunks of 10 due to Firestore limits)
    const fetchPersonalPricing = async () => {
      const overrideMap = new Map<string, number>();
      const phoneArray = Array.from(phoneNumbers);

      // Process in chunks of 10
      for (let i = 0; i < phoneArray.length; i += 10) {
        const chunk = phoneArray.slice(i, i + 10);
        
        try {
          const promises = chunk.map(async (phone) => {
            try {
              const overrides = await getAllPersonalPricing(siteId, phone);
              // getAllPersonalPricing returns Map<string, PersonalPricing> where key is serviceTypeId
              overrides.forEach((override, serviceTypeId) => {
                // serviceTypeId is the Map key; personalPricing is { [serviceTypeId]: number }
                if (serviceTypeId && override.price != null) {
                  const key = overrideKey(phone, serviceTypeId);
                  overrideMap.set(key, Number(override.price));
                }
              });
            } catch (err) {
              console.error(`[TeamPerformance] Failed to load personal pricing for phone ${phone}`, err);
            }
          });
          
          await Promise.all(promises);
        } catch (err) {
          console.error("[TeamPerformance] Error fetching personal pricing chunk", err);
        }
      }

      setPersonalPricingOverrides(overrideMap);
    };

    fetchPersonalPricing();
  }, [siteId, bookings]);

  // Build worker name map
  const workerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w) => {
      map.set(w.id, w.name);
    });
    return map;
  }, [workers]);

  // Worker's share of revenue (0–100%). Business gets (100 - this). Same field as treatmentCommissionPercent.
  const workerSharePercentMap = useMemo(() => {
    const map = new Map<string, number>();
    workers.forEach((w) => {
      const pct = w.treatmentCommissionPercent;
      map.set(w.id, pct != null && !Number.isNaN(pct) ? Math.min(100, Math.max(0, Number(pct))) : 0);
    });
    return map;
  }, [workers]);

  // Price resolution: שלב 2 = מחיר המשך מהמחירון (או מהשדה price בתיעוד); שלב 1 = מחיר שורה + מחיר אישי
  const getEffectivePriceForBooking = (booking: Booking): number => {
    const clientPhone = booking.clientId || booking.customerPhone;
    const phase = booking.phase ?? 1;

    if (phase === 2) {
      if (typeof booking.price === "number" && !Number.isNaN(booking.price)) {
        return Math.max(0, booking.price);
      }
      const parentId = booking.parentBookingId;
      const parent = parentId ? bookingsById.get(parentId) : undefined;
      const parentTypeId = parent?.serviceTypeId || parent?.pricingItemId;
      if (!parentTypeId) return 0;
      const parentItem = pricingItemById.get(parentTypeId);
      return catalogRevenuePhase2(parentItem);
    }

    const serviceTypeId = booking.serviceTypeId || booking.pricingItemId;
    const key = clientPhone && serviceTypeId ? overrideKey(clientPhone, serviceTypeId) : "";
    const overridePrice = key ? personalPricingOverrides.get(key) : undefined;
    const item = serviceTypeId ? pricingItemById.get(serviceTypeId) : undefined;
    const catalogP1 = serviceTypeId ? catalogRevenuePhase1(item) : 0;
    const defaultPrice = serviceTypeId ? serviceTypePriceMap.get(serviceTypeId) : undefined;
    const resolvedPrice =
      overridePrice ??
      (typeof booking.price === "number" && !Number.isNaN(booking.price) ? booking.price : undefined) ??
      defaultPrice ??
      catalogP1 ??
      0;

    if (defaultPrice === undefined && resolvedPrice === 0 && serviceTypeId) {
      console.warn("[TeamPerformance] Missing default price", { serviceTypeId, bookingId: booking.id });
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[TeamPerformance] Price resolved", {
        bookingId: booking.id,
        clientPhone,
        serviceTypeId,
        phase,
        overridePrice: overridePrice ?? null,
        defaultPrice: defaultPrice ?? null,
        resolvedPrice,
      });
    }
    return resolvedPrice;
  };

  // Calculate metrics per worker: gross revenue, worker payout (worker %), business share (100 - worker %), avg per hour (worker)
  const workerMetrics = useMemo(() => {
    const metricsMap = new Map<string, WorkerMetrics>();

    bookings.forEach((booking) => {
      if (!booking.workerId) return;

      const existing = metricsMap.get(booking.workerId) || {
        workerId: booking.workerId,
        workerName: workerNameMap.get(booking.workerId) || booking.workerId,
        grossRevenue: 0,
        workerPayout: 0,
        businessShare: 0,
        totalMinutes: 0,
        totalHours: 0,
        avgPerHour: 0,
      };

      const price = getEffectivePriceForBooking(booking);
      existing.grossRevenue += price;

      let durationMinutes = 0;
      if (booking.startAt && booking.endAt) {
        try {
          const start = booking.startAt.toDate ? booking.startAt.toDate() : new Date(booking.startAt);
          const end = booking.endAt.toDate ? booking.endAt.toDate() : new Date(booking.endAt);
          durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
        } catch (e) {
          durationMinutes = booking.durationMin || 0;
        }
      } else {
        durationMinutes = booking.durationMin || 0;
      }
      existing.totalMinutes += durationMinutes;
      metricsMap.set(booking.workerId, existing);
    });

    const metrics: WorkerMetrics[] = Array.from(metricsMap.values()).map((m) => {
      const totalHours = m.totalMinutes / 60;
      const workerSharePercent = workerSharePercentMap.get(m.workerId) ?? 0;
      const workerPayout = m.grossRevenue * (workerSharePercent / 100);
      const businessShare = m.grossRevenue * (1 - workerSharePercent / 100);
      const avgPerHour = totalHours > 0 ? workerPayout / totalHours : 0;
      return {
        ...m,
        workerPayout,
        businessShare,
        totalHours,
        avgPerHour,
      };
    });

    return metrics.sort((a, b) => b.workerPayout - a.workerPayout);
  }, [
    bookings,
    workerNameMap,
    workerSharePercentMap,
    personalPricingOverrides,
    serviceTypePriceMap,
    bookingsById,
    pricingItemById,
  ]);

  // Totals: gross, hours, worker payout total, business share total
  const totals = useMemo(() => {
    const totalGrossRevenue = workerMetrics.reduce((sum, m) => sum + m.grossRevenue, 0);
    const totalHours = workerMetrics.reduce((sum, m) => sum + m.totalHours, 0);
    const totalWorkerPayout = workerMetrics.reduce((sum, m) => sum + m.workerPayout, 0);
    const totalBusinessShare = workerMetrics.reduce((sum, m) => sum + m.businessShare, 0);
    const avgPerHour = totalHours > 0 ? totalWorkerPayout / totalHours : 0;
    return { totalGrossRevenue, totalHours, totalWorkerPayout, totalBusinessShare, avgPerHour };
  }, [workerMetrics]);

  const handleRefresh = () => {
    setRefreshing(true);
    // Force re-fetch by updating a dummy state
    setTimeout(() => setRefreshing(false), 500);
  };

  // Format time as HH:MM
  const formatTime = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return `₪${amount.toFixed(2)}`;
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="mb-6">
        <AdminPageHero
          title="ביצועי צוות"
          subtitle="דוח ביצועים לפי עובד - הכנסות ושעות עבודה"
        />
      </div>

      {/* Filters */}
      <AdminCard className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Period Toggle */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">תקופה:</label>
            <div className="flex border border-slate-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setPeriodType("daily")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  periodType === "daily"
                    ? "bg-caleno-ink text-white"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                יומי
              </button>
              <button
                onClick={() => setPeriodType("monthly")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  periodType === "monthly"
                    ? "bg-caleno-ink text-white"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                חודשי
              </button>
            </div>
          </div>

          {/* Date/Month Picker */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">
              {periodType === "daily" ? "תאריך:" : "חודש:"}
            </label>
            {periodType === "daily" ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                dir="ltr"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                dir="ltr"
              />
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span>רענן</span>
          </button>
        </div>
      </AdminCard>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">טוען נתונים...</p>
        </div>
      ) : workerMetrics.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">אין נתונים לתקופה שנבחרה</p>
        </div>
      ) : (
        <AdminCard className="overflow-hidden">
          {/* Mobile: card-based layout */}
          <div className="space-y-4 p-3 sm:p-4 md:hidden">
            {/* Summary card */}
            <div className="overflow-hidden rounded-2xl border-2 border-[#99d7df] bg-[#f0fbfd] text-right shadow-sm">
              <div className="bg-[#d8f3f7] px-4 py-2.5">
                <p className="text-sm font-bold text-[#0b4f5a]">סיכום לתקופה</p>
              </div>
              <div className="space-y-3 px-4 py-3.5">
                <div>
                  <p className="text-xs font-medium text-slate-500">סה״כ שירותים</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#0F172A]">
                    {formatCurrency(totals.totalGrossRevenue)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/80 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-slate-500">שעות עבודה</p>
                    <p className="mt-1 text-base font-bold text-slate-900">{formatTime(totals.totalHours)}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-slate-500">ממוצע לשעה</p>
                    <p className="mt-1 text-base font-bold text-slate-900">
                      {totals.totalHours > 0 ? formatCurrency(totals.avgPerHour) : formatCurrency(0)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[#bde7e3] bg-[#eafaf7] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#2f6f67]">חלק עובד</p>
                    <p className="mt-1 text-base font-bold text-[#0F172A]">{formatCurrency(totals.totalWorkerPayout)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-slate-600">חלק עסק</p>
                    <p className="mt-1 text-base font-bold text-[#0F172A]">{formatCurrency(totals.totalBusinessShare)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-worker cards */}
            {workerMetrics.map((worker) => (
              <div key={worker.workerId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-sm">
                <div className="bg-slate-900 px-4 py-2.5">
                  <p className="text-sm font-bold text-white">{worker.workerName}</p>
                </div>
                <div className="space-y-3 px-4 py-3.5">
                  <div>
                    <p className="text-xs font-medium text-slate-500">סה״כ שירותים</p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#0F172A]">
                      {formatCurrency(worker.grossRevenue)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-100 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-slate-500">שעות עבודה</p>
                      <p className="mt-1 text-base font-bold text-slate-900">{formatTime(worker.totalHours)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-100 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-slate-500">ממוצע לשעה</p>
                      <p className="mt-1 text-base font-bold text-slate-900">
                        {worker.totalHours > 0 ? formatCurrency(worker.avgPerHour) : formatCurrency(0)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-[#bde7e3] bg-[#eafaf7] px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-[#2f6f67]">חלק עובד</p>
                      <p className="mt-1 text-base font-bold text-[#0F172A]">{formatCurrency(worker.workerPayout)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-slate-600">חלק עסק</p>
                      <p className="mt-1 text-base font-bold text-[#0F172A]">{formatCurrency(worker.businessShare)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-300">
                  <th className="text-right p-4 text-sm font-semibold text-slate-700">שם מטפל</th>
                  <th className="text-right p-4 text-sm font-semibold text-slate-700">שירותים</th>
                  <th className="text-right p-4 text-sm font-semibold text-slate-700">שעות עבודה</th>
                  <th className="text-right p-4 text-sm font-semibold text-slate-700">ממוצע לשעה</th>
                  <th className="text-right p-4 text-sm font-semibold text-slate-700">חלק עובד</th>
                  <th className="text-right p-4 text-sm font-semibold text-slate-700">חלק עסק</th>
                </tr>
              </thead>
              <tbody>
                {workerMetrics.map((worker) => (
                  <tr
                    key={worker.workerId}
                    className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-4">
                      <span className="font-medium text-slate-900">{worker.workerName}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-700">{formatCurrency(worker.grossRevenue)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-700">{formatTime(worker.totalHours)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-700">
                        {worker.totalHours > 0 ? formatCurrency(worker.avgPerHour) : formatCurrency(0)}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-700">{formatCurrency(worker.workerPayout)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-700">{formatCurrency(worker.businessShare)}</span>
                    </td>
                  </tr>
                ))}
                {/* Totals Row - סיכום לתקופה */}
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                  <td className="p-4">
                    <span className="text-slate-900">סיכום לתקופה</span>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-900">{formatCurrency(totals.totalGrossRevenue)}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-900">{formatTime(totals.totalHours)}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-900">
                      {totals.totalHours > 0 ? formatCurrency(totals.avgPerHour) : formatCurrency(0)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-900">{formatCurrency(totals.totalWorkerPayout)}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-900">{formatCurrency(totals.totalBusinessShare)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Business share summary — desktop only (mobile has it in summary card) */}
          <div className="hidden md:block p-4 bg-slate-50 border-t border-slate-200 text-right">
            <p className="text-sm font-medium text-slate-800">
              סה״כ חלק העסק: <span className="font-bold">{formatCurrency(totals.totalBusinessShare)}</span>
            </p>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
