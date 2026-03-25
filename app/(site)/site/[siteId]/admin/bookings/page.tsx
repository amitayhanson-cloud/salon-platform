"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";

const DEV_LOGS = false; // Set to true only when debugging listener loops
import Link from "next/link";
import { getAdminBasePathFromSiteId } from "@/lib/url";
import {
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import {
  bookingsCollection,
} from "@/lib/firestorePaths";
import { ymdLocal } from "@/lib/dateLocal";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { getDateRange, getTwoWeekStart, getSundayStart, toYYYYMMDD } from "@/lib/calendarUtils";
import { normalizeBooking, isBookingCancelled, isBookingArchived, isFollowUpBooking } from "@/lib/normalizeBooking";
import TwoWeekCalendar from "@/components/admin/TwoWeekCalendar";
import TaskListPanel from "@/components/admin/TaskListPanel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import CalenoLoading from "@/components/CalenoLoading";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";

interface Booking {
  id: string;
  serviceName: string;
  workerId: string | null;
  customerName: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMin: number;
  note?: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
  startAtMissing?: boolean; // true if startAt field is missing (backward compatibility)
}


export default function BookingsAdminPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [services, setServices] = useState<SiteService[]>([]);

  // Calendar state
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsCount, setBookingsCount] = useState<number>(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  // Two-week calendar state
  // Always starts on Sunday of the current week (week 1) + next week (week 2) = 14 days
  const [rangeStart, setRangeStart] = useState<Date>(() => {
    // Initialize to Sunday of the week containing today
    return getSundayStart(new Date());
  });

  // Store unsubscribe function reference for manual refresh
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Stable primitive for effect deps (avoids Date reference causing re-runs)
  const rangeStartKey = toYYYYMMDD(rangeStart);

  // Ref guard: avoid re-running setup when effect runs again with same siteId+range (e.g. parent re-render)
  const lastListenerKeyRef = useRef<{ siteId: string; rangeKey: string } | null>(null);

  // Load site config to check if booking is enabled. Deps: only siteId (primitive).
  useEffect(() => {
    if (!siteId) {
      if (DEV_LOGS) console.log("[BookingManagement] No siteId in config effect");
      return;
    }

    if (DEV_LOGS) console.log("[BookingManagement] Loading site config for siteId:", siteId);
    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (DEV_LOGS) console.log("[BookingManagement] Site config loaded:", cfg ? "exists" : "null");
        setConfig((prev) => (prev === cfg ? prev : (cfg ?? null)));
        if (!cfg && typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (DEV_LOGS) console.log("[BookingManagement] Using localStorage config");
              setConfig(parsed);
            } catch (e) {
              console.error("Failed to parse localStorage config", e);
            }
          }
        }
      },
      (e) => {
        console.error("[BookingManagement] Failed to load site config", e);
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (DEV_LOGS) console.log("[BookingManagement] Using localStorage config (error fallback)");
              setConfig(parsed);
            } catch (e) {
              console.error("Failed to parse localStorage config", e);
            }
          }
        }
      }
    );

    return () => {
      if (DEV_LOGS) console.log("[BookingManagement] Cleaning up site config subscription");
      unsubscribe?.();
    };
  }, [siteId]);

  // Load site services for calendar color lookup (same as day view)
  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeSiteServices(
      siteId,
      (svcs) => setServices((svcs ?? []).filter((s) => s.enabled !== false)),
      (e) => {
        console.error("[BookingManagement] Failed to load services", e);
        setServices([]);
      }
    );
    return () => unsub();
  }, [siteId]);

  // Validate siteId and setup realtime listeners. Deps: only stable primitives (siteId, rangeStartKey).
  useEffect(() => {
    if (DEV_LOGS) console.log("[BookingManagement] Effect running, siteId:", siteId, "rangeStartKey:", rangeStartKey);

    if (!siteId) {
      if (DEV_LOGS) console.error("[BookingManagement] Missing siteId");
      setError("siteId חסר. אנא רענן את הדף.");
      setLoading(false);
      return;
    }

    if (!db) {
      if (DEV_LOGS) console.error("[BookingManagement] Firebase not initialized");
      setError("Firebase לא מאותחל. אנא רענן את הדף.");
      setLoading(false);
      return;
    }

    // Skip redundant setup when same siteId+range (prevents loop from parent re-renders or Strict Mode)
    const listenerKey = { siteId, rangeKey: rangeStartKey };
    if (
      lastListenerKeyRef.current?.siteId === listenerKey.siteId &&
      lastListenerKeyRef.current?.rangeKey === listenerKey.rangeKey
    ) {
      if (DEV_LOGS) console.log("[BookingManagement] Same key, skipping duplicate setup");
      return;
    }
    lastListenerKeyRef.current = listenerKey;

    if (DEV_LOGS) console.log("[BookingManagement] Setting up realtime listeners for siteId:", siteId);
    const cleanup = setupRealtimeListeners();
    unsubscribeRef.current = cleanup;

    return () => {
      lastListenerKeyRef.current = null;
      if (DEV_LOGS) console.log("[BookingManagement] Cleaning up realtime listeners");
      cleanup();
      unsubscribeRef.current = null;
    };
  }, [siteId, rangeStartKey]);

  const setupRealtimeListeners = (): (() => void) => {
    if (!db || !siteId) {
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    setBookingsLoading(true);
    setBookingsError(null);

    const dateRange = getDateRange(rangeStart, 14);
    const rangeStartStr = toYYYYMMDD(dateRange[0]);
    const rangeEndStr = toYYYYMMDD(dateRange[13]);

    let fallbackUnsubscribe: (() => void) | null = null;

    const bookingsQuery = query(
      bookingsCollection(siteId),
      where("date", ">=", rangeStartStr),
      where("date", "<=", rangeEndStr),
      orderBy("date", "asc"),
      orderBy("time", "asc"),
      limit(500)
    );

    const bookingsUnsubscribe = onSnapshotDebug(
      "bookings-list",
      bookingsQuery,
      (snapshot) => {
        const raw = snapshot.docs.map((d) => normalizeBooking(d as { id: string; data: () => Record<string, unknown> }));
        const normalized = raw.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));
        setBookings((prev) => {
          if (prev.length !== normalized.length) return normalized;
          if (prev.length === 0 && normalized.length === 0) return prev;
          const same = normalized.every((b, i) => prev[i]?.id === b.id);
          return same ? prev : normalized;
        });
        const visitCount = normalized.filter((b) => !isFollowUpBooking(b as Record<string, unknown>)).length;
        setBookingsCount((n) => (n === visitCount ? n : visitCount));
        setBookingsLoading(false);
        setBookingsError(null);
        setLoading(false);
      },
      (err) => {
        if (err.message?.includes("index") || err.message?.includes("orderBy") || (err as { code?: string }).code === "failed-precondition") {
          const fallbackQuery = query(
            bookingsCollection(siteId),
            where("date", ">=", rangeStartStr),
            where("date", "<=", rangeEndStr),
            limit(500)
          );
          fallbackUnsubscribe = onSnapshotDebug(
            "bookings-list-fallback",
            fallbackQuery,
            (snapshot) => {
              const raw = snapshot.docs.map((d) => normalizeBooking(d as { id: string; data: () => Record<string, unknown> }));
              const normalized = raw.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));
              normalized.sort((a, b) => {
                const dc = (a.dateStr || "").localeCompare(b.dateStr || "");
                if (dc !== 0) return dc;
                return (a.timeHHmm || "").localeCompare(b.timeHHmm || "");
              });
              setBookings((prev) => {
                if (prev.length !== normalized.length) return normalized;
                if (prev.length === 0 && normalized.length === 0) return prev;
                const same = normalized.every((b, i) => prev[i]?.id === b.id);
                return same ? prev : normalized;
              });
              const visitCount = normalized.filter((b) => !isFollowUpBooking(b as Record<string, unknown>)).length;
        setBookingsCount((n) => (n === visitCount ? n : visitCount));
              setBookingsError(null);
              setBookingsLoading(false);
              setLoading(false);
            },
            (fallbackErr) => {
              setBookingsError(fallbackErr.message || "שגיאה בטעינת התורים");
              setBookingsLoading(false);
              setLoading(false);
              setBookings([]);
              setBookingsCount(0);
            }
          );
        } else {
          setBookingsError(err.message || "שגיאה בטעינת התורים");
          setBookingsLoading(false);
          setLoading(false);
          setBookings([]);
          setBookingsCount(0);
        }
      }
    );

    return () => {
      bookingsUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  };



  // Resolve service color from site services (same as day view) so every booking gets a consistent color
  const serviceColorLookup = useMemo(() => {
    const byName = new Map<string, string>();
    const byId = new Map<string, string>();
    const normalize = (s: string) => (s ?? "").trim().toLowerCase();
    services.forEach((service) => {
      const raw = (service.color ?? "").trim();
      const color = /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw : "#3B82F6";
      if (service.name) {
        const name = service.name.trim();
        byName.set(service.name, color);
        if (name) byName.set(name, color);
        byName.set(normalize(service.name), color);
      }
      if (service.id) byId.set(service.id, color);
    });
    return { byName, byId, normalize };
  }, [services]);

  const resolveBookingColor = useCallback(
    (b: { serviceName?: string; serviceId?: string; serviceColor?: string | null; phases?: Array<{ serviceColor?: string }> }) => {
      const stored = b.serviceColor ?? b.phases?.[0]?.serviceColor;
      if (stored && /^#[0-9A-Fa-f]{6}$/.test(String(stored).trim())) return String(stored).trim();
      const name = (b.serviceName ?? "").trim();
      const id = b.serviceId;
      return (
        serviceColorLookup.byName.get(b.serviceName ?? "") ??
        (name ? serviceColorLookup.byName.get(name) : null) ??
        serviceColorLookup.byName.get(serviceColorLookup.normalize(b.serviceName ?? "")) ??
        (id ? serviceColorLookup.byId.get(id) : null) ??
        undefined
      );
    },
    [serviceColorLookup]
  );

  // Get 14-day date range
  const dateRange = getDateRange(rangeStart, 14);
  const dateRangeKeys = dateRange.map(toYYYYMMDD);

  // Group by dateStr (string day key); bookings are already normalized and non-cancelled from listener
  type DayBooking = { id: string; time: string; serviceName: string; workerName?: string; serviceColor?: string };
  const groupedByDay = dateRangeKeys.reduce<Record<string, DayBooking[]>>((acc, dayKey) => {
    const dayBookings: DayBooking[] = bookings
      .filter((b: { dateStr?: string }) => !isFollowUpBooking(b as Record<string, unknown>))
      .filter((b: { dateStr?: string }) => (b.dateStr ?? (b as any).date) === dayKey)
      .sort((a: { timeHHmm?: string; time?: string }, b: { timeHHmm?: string; time?: string }) =>
        (a.timeHHmm ?? a.time ?? "").localeCompare(b.timeHHmm ?? b.time ?? "")
      )
      .map((b: any) => ({
        id: b.id,
        time: b.timeHHmm ?? b.time ?? "N/A",
        serviceName: b.serviceName ?? "N/A",
        workerName: b.workerName ?? b.workerId ?? undefined,
        serviceColor: resolveBookingColor(b),
      }));
    acc[dayKey] = dayBookings;
    return acc;
  }, {});

  const bookingsByDay = groupedByDay;



  // Add timeout to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.warn("[BookingManagement] Loading timeout - forcing loading to false");
        setLoading(false);
        if (!bookingsError) {
          setError("טעינת הנתונים לוקחת זמן רב. אנא רענן את הדף.");
        }
      }, 10000); // 10 second timeout

      return () => clearTimeout(timeout);
    }
  }, [loading, bookingsError]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center w-full"
        style={{
          background: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)",
        }}
      >
        <CalenoLoading />
      </div>
    );
  }

  if (!siteId) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-right">
          <p className="text-red-700 font-semibold mb-2">שגיאה</p>
          <p className="text-sm text-red-600">siteId חסר. אנא רענן את הדף.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <AdminPageHero
            title="ניהול הזמנות"
            subtitle="יומן תורים וניהול משימות"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Calendar */}
        <div className="mb-6">
        <AdminCard className="p-4 md:p-6">
            {/* One line: title (right in RTL) | date display + arrows (exact center) | links (left in RTL) */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 md:items-center mb-4 md:mb-6">
              <div className="flex flex-col items-center order-1 md:items-start text-center md:text-right" aria-hidden>
                <span className="text-base font-semibold text-slate-900 md:text-xl md:font-bold">יומן תורים</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 md:gap-2 order-2">
                <button
                  type="button"
                  onClick={() => {
                    const newStart = new Date(rangeStart);
                    newStart.setDate(rangeStart.getDate() - 14);
                    setRangeStart(newStart);
                  }}
                  className="p-2 rounded-lg border border-[#E2E8F0] bg-white text-slate-600 hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-colors md:px-3 md:py-1.5 md:text-sm"
                  aria-label="שבועות קודמים"
                >
                  <ChevronRight className="w-4 h-4 md:w-4 md:h-4" />
                </button>
                <span
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-slate-700 text-xs font-medium md:px-4 md:py-2 md:text-sm min-w-[7rem] text-center"
                  aria-hidden
                >
                  {dateRange[0]?.getDate()}.{dateRange[0]?.getMonth() != null ? dateRange[0].getMonth() + 1 : ""} – {dateRange[13]?.getDate()}.{dateRange[13]?.getMonth() != null ? dateRange[13].getMonth() + 1 : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newStart = new Date(rangeStart);
                    newStart.setDate(rangeStart.getDate() + 14);
                    setRangeStart(newStart);
                  }}
                  className="p-2 rounded-lg border border-[#E2E8F0] bg-white text-slate-600 hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-colors md:px-3 md:py-1.5 md:text-sm"
                  aria-label="שבועות הבאים"
                >
                  <ChevronLeft className="w-4 h-4 md:w-4 md:h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 order-3 justify-center md:justify-end">
                <Link
                  href={`${getAdminBasePathFromSiteId(siteId)}/bookings/cancelled`}
                  className="rounded-full border border-[#E2E8F0] bg-white/80 px-4 py-2 text-sm font-medium text-[#0F172A] backdrop-blur transition-colors hover:bg-white"
                >
                  תורים שבוטלו
                </Link>
              </div>
            </div>

            {bookingsLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading bookings…</p>
            ) : bookingsError ? (
              <p className="text-sm text-red-600 text-center py-8">Error: {bookingsError}</p>
            ) : (
              <TwoWeekCalendar
                dateRange={dateRange}
                bookingsByDay={bookingsByDay}
                onDayClick={(date) => {
                  // Navigation handled by TwoWeekCalendar component
                }}
                siteId={siteId}
              />
            )}
          </AdminCard>

        {/* Tasks (below calendar) */}
        <div className="mt-4">
          <TaskListPanel siteId={siteId} maxHeight="280px" />
        </div>
        </div>

      </div>
    </div>
  );
}

