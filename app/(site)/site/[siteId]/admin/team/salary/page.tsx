"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { query, where, orderBy, limit, Timestamp, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import { bookingsCollection, workersCollection } from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { RefreshCw } from "lucide-react";
import { subscribePricingItems } from "@/lib/firestorePricing";
import type { PricingItem } from "@/types/pricingItem";
import { getAllPersonalPricing } from "@/lib/firestorePersonalPricing";

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

  // Build service type price map (default prices)
  const serviceTypePriceMap = useMemo(() => {
    const map = new Map<string, number>();
    pricingItems.forEach((item) => {
      // Use price or priceRangeMin as default (allow 0 as valid)
      const defaultPrice = item.price ?? item.priceRangeMin ?? 0;
      if (defaultPrice != null) {
        map.set(item.id, Number(defaultPrice));
      }
    });
    return map;
  }, [pricingItems]);

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

  // Price resolution: personal override (client-specific) for serviceTypeId, else default serviceType price, else 0
  const getEffectivePriceForBooking = (booking: Booking): number => {
    const clientPhone = booking.clientId || booking.customerPhone;
    const serviceTypeId = booking.serviceTypeId || booking.pricingItemId;

    const key = clientPhone && serviceTypeId ? overrideKey(clientPhone, serviceTypeId) : "";
    const overridePrice = key ? personalPricingOverrides.get(key) : undefined;
    const defaultPrice = serviceTypeId ? serviceTypePriceMap.get(serviceTypeId) : undefined;
    const resolvedPrice = overridePrice ?? defaultPrice ?? 0;

    if (defaultPrice === undefined && resolvedPrice === 0 && serviceTypeId) {
      console.warn("[TeamPerformance] Missing default price", { serviceTypeId, bookingId: booking.id });
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[TeamPerformance] Price resolved", {
        bookingId: booking.id,
        clientPhone,
        serviceTypeId,
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
  }, [bookings, workerNameMap, workerSharePercentMap, personalPricingOverrides, serviceTypePriceMap]);

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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">ביצועי צוות</h1>
        <p className="text-sm text-slate-500 mt-1">
          דוח ביצועים לפי עובד - הכנסות ושעות עבודה
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Period Toggle */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">תקופה:</label>
            <div className="flex border border-slate-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setPeriodType("daily")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  periodType === "daily"
                    ? "bg-caleno-500 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                יומי
              </button>
              <button
                onClick={() => setPeriodType("monthly")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  periodType === "monthly"
                    ? "bg-caleno-500 text-white"
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
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
                dir="ltr"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
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
      </div>

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
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
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
          {/* Business share summary */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
            <p className="text-sm font-medium text-slate-800">
              סה״כ חלק העסק: <span className="font-bold">{formatCurrency(totals.totalBusinessShare)}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
