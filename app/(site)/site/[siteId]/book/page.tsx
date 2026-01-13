"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebaseClient";
import { doc, getDoc, onSnapshot, query, where, getDocs, orderBy } from "firebase/firestore";
import { collection } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { saveBooking } from "@/lib/booking";
import { bookingsCollection, bookingSettingsDoc } from "@/lib/firestorePaths";
import {
  getNext14Days,
  formatDateForDisplay,
  formatDateShort,
} from "@/lib/timeSlots";
import { ymdLocal } from "@/lib/dateLocal";
import { bookingEnabled } from "@/lib/bookingEnabled";
import { useRouter } from "next/navigation";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import {
  subscribeBookingSettings,
  ensureBookingSettings,
} from "@/lib/firestoreBookingSettings";
import type { BookingSettings } from "@/types/bookingSettings";
import { defaultBookingSettings } from "@/types/bookingSettings";
import { defaultThemeColors } from "@/types/siteConfig";

type BookingStep = 1 | 2 | 3 | 4 | 5 | 6; // 6 = success

interface ServiceOption {
  id: string;
  name: string;
  price: number;
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<BookingStep>(1);
  
  // Booking settings from Firestore
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>(defaultBookingSettings);
  const [workers, setWorkers] = useState<Array<{ id: string; name: string; role?: string }>>([]);
  const [workersLoading, setWorkersLoading] = useState<boolean>(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  
  // Bookings for filtering
  const [bookingsForDate, setBookingsForDate] = useState<Array<{ workerId: string | null; time: string; status: string }>>([]);

  // Booking form state
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<{ id: string; name: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientNote, setClientNote] = useState("");


  // Load site config from Firestore
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (cfg) {
          setConfig(cfg);
        } else {
          // Fallback to localStorage
          if (typeof window !== "undefined") {
            try {
              const configRaw = window.localStorage.getItem(`siteConfig:${siteId}`);
              if (configRaw) {
                setConfig(JSON.parse(configRaw));
              } else {
                setConfig(defaultSiteConfig);
              }
            } catch (e) {
              console.error("Failed to load site config", e);
              setConfig(defaultSiteConfig);
            }
          } else {
            setConfig(defaultSiteConfig);
          }
        }
      },
      (e) => {
        console.error("Failed to load site config from Firestore", e);
        // Fallback to localStorage
        if (typeof window !== "undefined") {
          try {
            const configRaw = window.localStorage.getItem(`siteConfig:${siteId}`);
            if (configRaw) {
              setConfig(JSON.parse(configRaw));
            } else {
              setConfig(defaultSiteConfig);
            }
          } catch (err) {
            console.error("Failed to load site config", err);
            setConfig(defaultSiteConfig);
          }
        } else {
          setConfig(defaultSiteConfig);
        }
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [siteId]);

  // Load booking settings and workers (only if booking is enabled)
  useEffect(() => {
    if (!siteId || !db || typeof window === "undefined") return;
    if (!config || !bookingEnabled(config)) {
      setLoading(false);
      return;
    }

    // Ensure booking settings exist
    ensureBookingSettings(siteId).catch((e) => {
      console.error("Failed to ensure booking settings", e);
    });

    // Load booking settings from Firestore
    const settingsUnsubscribe = subscribeBookingSettings(
      siteId,
      (settings) => {
        setBookingSettings(settings);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load booking settings", err);
        setBookingSettings(defaultBookingSettings);
        setLoading(false);
      }
    );

    // Load workers from Firestore
    setWorkersLoading(true);
    const workersRef = collection(db, "sites", siteId, "workers");
    const workersQuery = query(workersRef, orderBy("name", "asc"));
    const workersUnsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const workersList: Array<{ id: string; name: string; role?: string }> = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.active !== false) {
            workersList.push({
              id: docSnap.id,
              name: data.name || "",
              role: data.role,
            });
          }
        });
        console.log("[Booking] workers loaded", workersList.length);
        setWorkers(workersList);
        setWorkersLoading(false);
        setWorkersError(null);
      },
      (err) => {
        console.error("[Booking] Failed to load workers", err);
        setWorkersError("שגיאה בטעינת העובדים");
        setWorkersLoading(false);
      }
    );

    return () => {
      settingsUnsubscribe();
      workersUnsubscribe();
    };
  }, [siteId, config]);

  // Load bookings for selected date
  useEffect(() => {
    if (!db || !siteId || !selectedDate) {
      setBookingsForDate([]);
      return;
    }

    const dateStr = ymdLocal(selectedDate);
    const q = query(
      bookingsCollection(siteId),
      where("date", "==", dateStr),
      where("status", "==", "confirmed")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bookings: Array<{ workerId: string | null; time: string; status: string }> = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          bookings.push({
            workerId: data.workerId || null,
            time: data.time || "",
            status: data.status || "confirmed",
          });
        });
        setBookingsForDate(bookings);
      },
      (err) => {
        console.error("Failed to load bookings for date", err);
        setBookingsForDate([]);
      }
    );

    return () => unsubscribe();
  }, [siteId, selectedDate]);

  // Convert services from config to ServiceOption format
  // Services are now string[] format, with prices in servicePricing
  const servicePricing = config?.servicePricing || {};
  const serviceOptions: ServiceOption[] =
    (config?.services || []).map((serviceName, index) => {
      // Handle both string[] format (new) and ServiceItem[] format (backwards compatibility)
      const name = typeof serviceName === 'string' ? serviceName : (serviceName as any).name || '';
      const price = servicePricing[name] ?? (typeof serviceName === 'object' ? ((serviceName as any).price || 0) : 0);
      // Generate stable ID for service
      const id = typeof serviceName === 'string' 
        ? name.replace(/\s+/g, '-').toLowerCase()
        : (serviceName as any).id || `service-${index}`;
      return {
        id: id,
        name: name,
        price: price,
      };
    }).filter(s => s.name.trim()) || [];

  const availableDates = getNext14Days();

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return selectedService !== null;
      case 2:
        // Worker selection is optional (can be null)
        return true;
      case 3:
        return selectedDate !== null;
      case 4:
        return selectedTime !== "";
      case 5:
        return clientName.trim() !== "" && clientPhone.trim() !== "";
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (isStepValid() && step < 5) {
      setStep((step + 1) as BookingStep);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as BookingStep);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isStepValid() || !selectedService || !selectedDate || !selectedTime) {
      return;
    }

    if (!db) {
      setSubmitError("Firebase לא מאותחל. אנא רענן את הדף.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const bookingDate = ymdLocal(selectedDate);
      console.log("[BookingSubmit] date:", bookingDate, "time:", selectedTime);
      
      await saveBooking(siteId, {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        workerId: selectedWorker?.id || null,
        workerName: selectedWorker?.name || null,
        date: bookingDate,
        time: selectedTime,
        name: clientName.trim(),
        phone: clientPhone.trim(),
        note: clientNote.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      setStep(6); // Show success
    } catch (err) {
      console.error("Failed to save booking", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSubmitError(`שגיאה בשמירת ההזמנה: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if booking is enabled
  useEffect(() => {
    if (config && !bookingEnabled(config)) {
      router.replace(`/site/${siteId}`);
    }
  }, [config, siteId, router]);

  // Get theme colors with defaults
  const theme = config?.themeColors || defaultThemeColors;

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>טוען את עמוד ההזמנה…</p>
      </div>
    );
  }

  // Show disabled message if booking is not enabled
  if (!bookingEnabled(config)) {
    return (
      <div 
        dir="rtl" 
        className="min-h-screen py-8"
        style={{ 
          backgroundColor: "var(--bg)",
          "--bg": theme.background,
          "--surface": theme.surface,
          "--text": theme.text,
          "--muted": theme.mutedText,
          "--primary": theme.primary,
          "--primaryText": theme.primaryText,
          "--accent": theme.accent,
          "--border": theme.border,
        } as React.CSSProperties}
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="rounded-3xl shadow-lg p-6 sm:p-8 text-center" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
              הזמנות אונליין לא פעילות
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              באתר הזה לא הופעלה אפשרות הזמנות אונליין.
            </p>
            <Link
              href={`/site/${siteId}`}
              className="inline-block px-6 py-3 font-semibold rounded-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--primary)", color: "var(--primaryText)" }}
            >
              חזרה לאתר
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = [
    { num: 1, label: "שירות" },
    { num: 2, label: "איש צוות" },
    { num: 3, label: "תאריך" },
    { num: 4, label: "שעה" },
    { num: 5, label: "פרטים" },
  ];

  if (step === 6) {
    // Success screen
    return (
      <div 
        dir="rtl" 
        className="min-h-screen py-8"
        style={{ 
          backgroundColor: "var(--bg)",
          "--bg": theme.background,
          "--surface": theme.surface,
          "--text": theme.text,
          "--muted": theme.mutedText,
          "--primary": theme.primary,
          "--primaryText": theme.primaryText,
          "--accent": theme.accent,
          "--border": theme.border,
        } as React.CSSProperties}
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="rounded-3xl shadow-lg p-6 sm:p-8 text-center" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
            <div className="mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#d1fae5" }}>
                <svg
                  className="w-8 h-8"
                  style={{ color: "#10b981" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--text)" }}>
                ההזמנה נקלטה
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                נחזור אליך בקרוב לאישור התור
              </p>
            </div>

            <div className="rounded-2xl p-6 mb-6 text-right space-y-3" style={{ backgroundColor: "var(--bg)" }}>
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>שירות:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedService?.name}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>מעצב:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedWorker?.name}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--muted)" }}>תאריך:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedDate ? formatDateForDisplay(selectedDate) : ""}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--muted)" }}>שעה:</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedTime}
                </span>
              </div>
            </div>

            <Link
              href={`/site/${siteId}`}
              className="inline-block px-6 py-3 font-semibold rounded-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--primary)", color: "var(--primaryText)" }}
            >
              חזרה לאתר
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Helper functions for time conversion
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };

  // Generate available time slots for selected date
  const generateTimeSlotsForDate = (): string[] => {
    if (!selectedDate) return [];

    const dayIndex = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday
    const dayKey = String(dayIndex) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
    const dayConfig = bookingSettings.days[dayKey];

    if (!dayConfig || !dayConfig.enabled) {
      return [];
    }

    const startMin = timeToMinutes(dayConfig.start);
    const endMin = timeToMinutes(dayConfig.end);
    const slotSize = bookingSettings.slotMinutes;

    // Validate hours
    if (endMin <= startMin) {
      return []; // Invalid hours - will show error in UI
    }

    // Generate slots
    const slots: string[] = [];
    let currentTime = startMin;

    while (currentTime + slotSize <= endMin) {
      slots.push(minutesToTime(currentTime));
      currentTime += slotSize;
    }

    return slots;
  };

  // Filter slots by booked times
  const availableTimeSlots = (() => {
    if (!selectedDate) return [];

    const generatedSlots = generateTimeSlotsForDate();
    
    // Filter out booked slots
    return generatedSlots.filter((time) => {
      // Check if this slot is booked for the selected worker (or any worker if no worker selected)
      const isBooked = bookingsForDate.some((booking) => {
        if (booking.time !== time) return false;
        if (booking.status !== "confirmed") return false;
        // If worker selected, only block if same worker
        if (selectedWorker) {
          return booking.workerId === selectedWorker.id;
        }
        // If no worker selected, block if any worker has it
        return booking.workerId !== null;
      });
      return !isBooked;
    });
  })();

  // Check if date is available (has schedule)
  const isDateAvailable = (date: Date): boolean => {
    const dayIndex = date.getDay();
    const dayKey = String(dayIndex) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
    const dayConfig = bookingSettings.days[dayKey];
    return dayConfig?.enabled === true;
  };

  // Debug info for step 4
  const debugInfo = selectedDate ? (() => {
    const dayIndex = selectedDate.getDay();
    const dayKey = String(dayIndex) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
    const dayConfig = bookingSettings.days[dayKey];
    const generatedSlots = generateTimeSlotsForDate();
    
    return {
      selectedDate: ymdLocal(selectedDate),
      dayIndex,
      dayKey,
      dayConfig: JSON.stringify(dayConfig, null, 2),
      slotMinutes: bookingSettings.slotMinutes,
      generatedSlotsCount: generatedSlots.length,
      bookingsForDateCount: bookingsForDate.length,
      availableSlotsCount: availableTimeSlots.length,
      workersCount: workers.length,
      firstWorkerName: workers.length > 0 ? workers[0].name : "none",
    };
  })() : null;

  return (
    <div 
      dir="rtl" 
      className="min-h-screen py-6 sm:py-8"
      style={{ 
        backgroundColor: "var(--bg)",
        "--bg": theme.background,
        "--surface": theme.surface,
        "--text": theme.text,
        "--muted": theme.mutedText,
        "--primary": theme.primary,
        "--primaryText": theme.primaryText,
        "--accent": theme.accent,
        "--border": theme.border,
      } as React.CSSProperties}
    >
      <div className="max-w-2xl mx-auto px-4">
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--text)" }}>
              הזמנת תור
            </h1>
            <Link
              href={`/site/${siteId}`}
              className="text-sm hover:opacity-80 transition-opacity"
              style={{ color: "var(--muted)" }}
            >
              ביטול
            </Link>
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
            {stepLabels.map((s) => (
              <div
                key={s.num}
                className={`flex flex-col items-center ${
                  step === s.num ? "font-semibold" : ""
                }`}
                style={{ color: step === s.num ? "var(--accent)" : "var(--muted)" }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
                  style={{
                    backgroundColor: step === s.num 
                      ? "var(--primary)" 
                      : step > s.num 
                      ? "#10b981" 
                      : "var(--border)",
                    color: step === s.num || step > s.num ? "var(--primaryText)" : "var(--muted)"
                  }}
                >
                  {step > s.num ? "✓" : s.num}
                </div>
                <span className="text-[10px]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="rounded-3xl shadow-lg p-6 sm:p-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
          {/* Step 1: Service selection */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו שירות
              </h2>
              <div className="space-y-3">
                {serviceOptions.length === 0 ? (
                  <p className="text-sm text-right" style={{ color: "var(--muted)" }}>
                    אין שירותים זמינים כרגע
                  </p>
                ) : (
                  serviceOptions.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setSelectedService(service)}
                      className="w-full text-right p-4 rounded-2xl border-2 transition-all hover:opacity-90"
                      style={{
                        borderColor: selectedService?.id === service.id ? "var(--primary)" : "var(--border)",
                        backgroundColor: selectedService?.id === service.id ? "var(--bg)" : "var(--surface)",
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                            {service.name}
                          </h3>
                          {service.price > 0 && (
                            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                              החל מ־₪{service.price}
                            </p>
                          )}
                        </div>
                        {service.price > 0 && (
                          <span className="text-lg font-bold" style={{ color: "var(--text)" }}>
                            החל מ־₪{service.price}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Worker selection */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו איש צוות
              </h2>
              <p className="text-sm mb-3 text-right" style={{ color: "var(--muted)" }}>
                (אופציונלי - ניתן לדלג)
              </p>
              <div className="space-y-3">
                {workersLoading ? (
                  <p className="text-sm text-right" style={{ color: "var(--muted)" }}>טוען עובדים…</p>
                ) : workersError ? (
                  <div className="p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                    <p className="text-sm" style={{ color: "#991b1b" }}>{workersError}</p>
                  </div>
                ) : workers.length === 0 ? (
                  <div className="space-y-4 text-center">
                    <p className="text-sm text-right" style={{ color: "var(--muted)" }}>
                      אין עובדים במערכת עדיין
                    </p>
                    <Link
                      href={`/site/${siteId}/admin/bookings`}
                      className="inline-block px-6 py-3 font-semibold rounded-lg transition-colors hover:opacity-90"
                      style={{ backgroundColor: "var(--primary)", color: "var(--primaryText)" }}
                    >
                      הוסף עובדים בפאנל ניהול
                    </Link>
                  </div>
                ) : (
                  workers.map((worker) => (
                    <button
                      key={worker.id}
                      type="button"
                      onClick={() =>
                        setSelectedWorker({ id: worker.id, name: worker.name })
                      }
                      className="w-full text-right p-4 rounded-2xl border-2 transition-all hover:opacity-90"
                      style={{
                        borderColor: selectedWorker?.id === worker.id ? "var(--primary)" : "var(--border)",
                        backgroundColor: selectedWorker?.id === worker.id ? "var(--bg)" : "var(--surface)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style={{ backgroundColor: "var(--border)", color: "var(--text)" }}>
                          {worker.name[0]}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                            {worker.name}
                          </h3>
                          {worker.role && (
                            <p className="text-xs" style={{ color: "var(--muted)" }}>{worker.role}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 3: Date selection */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו תאריך
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableDates.map((date) => {
                  const available = isDateAvailable(date);
                  const isSelected =
                    selectedDate &&
                    ymdLocal(selectedDate) === ymdLocal(date);

                  return (
                    <button
                      key={ymdLocal(date)}
                      type="button"
                      onClick={() => available && setSelectedDate(date)}
                      disabled={!available}
                      className="p-3 rounded-xl border-2 text-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        borderColor: isSelected ? "var(--primary)" : available ? "var(--border)" : "var(--border)",
                        backgroundColor: isSelected ? "var(--bg)" : available ? "var(--surface)" : "var(--bg)",
                        color: isSelected ? "var(--text)" : available ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      <div className="font-semibold mb-1">
                        {formatDateShort(date)}
                      </div>
                      <div className="text-xs">
                        {date.toLocaleDateString("he-IL", { weekday: "short" })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Time selection */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                בחרו שעה
              </h2>
              {selectedDate && (
                <p className="text-sm mb-4 text-right" style={{ color: "var(--muted)" }}>
                  {formatDateForDisplay(selectedDate)}
                </p>
              )}
              
              {/* Debug panel */}
              {debugInfo && (
                <div className="mb-4 p-4 rounded-lg border text-right text-xs font-mono" style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }}>
                  <div className="space-y-1" style={{ color: "var(--text)" }}>
                    <div><strong>selectedDate:</strong> {debugInfo.selectedDate}</div>
                    <div><strong>dayIndex:</strong> {debugInfo.dayIndex}</div>
                    <div><strong>dayKey:</strong> "{debugInfo.dayKey}"</div>
                    <div><strong>dayConfig:</strong> <pre className="whitespace-pre-wrap">{debugInfo.dayConfig}</pre></div>
                    <div><strong>slotMinutes:</strong> {debugInfo.slotMinutes}</div>
                    <div><strong>generatedSlots count:</strong> {debugInfo.generatedSlotsCount}</div>
                    <div><strong>bookingsForDate count:</strong> {debugInfo.bookingsForDateCount}</div>
                    <div><strong>availableSlots count:</strong> {debugInfo.availableSlotsCount}</div>
                    <div><strong>workers count:</strong> {debugInfo.workersCount}</div>
                    <div><strong>first worker name:</strong> {debugInfo.firstWorkerName}</div>
                  </div>
                </div>
              )}

              {/* Check for invalid hours */}
              {selectedDate && (() => {
                const dayIndex = selectedDate.getDay();
                const dayKey = String(dayIndex) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
                const dayConfig = bookingSettings.days[dayKey];
                if (dayConfig && dayConfig.enabled) {
                  const startMin = timeToMinutes(dayConfig.start);
                  const endMin = timeToMinutes(dayConfig.end);
                  if (endMin <= startMin) {
                    return (
                      <div className="p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                        <p className="text-sm" style={{ color: "#991b1b" }}>שעות פעילות לא תקינות</p>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {availableTimeSlots.length === 0 ? (
                <p className="text-sm text-right" style={{ color: "var(--muted)" }}>
                  אין שעות זמינות לתאריך זה
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {availableTimeSlots.map((time) => {
                    const isSelected = selectedTime === time;

                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
                        className="p-3 rounded-xl border-2 text-sm font-medium transition-all hover:opacity-90"
                        style={{
                          borderColor: isSelected ? "var(--primary)" : "var(--border)",
                          backgroundColor: isSelected ? "var(--bg)" : "var(--surface)",
                          color: "var(--text)",
                        }}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Client details */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 text-right" style={{ color: "var(--text)" }}>
                פרטי לקוח
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="clientName"
                    className="block text-sm font-medium mb-2 text-right"
                    style={{ color: "var(--text)" }}
                  >
                    שם מלא *
                  </label>
                  <input
                    type="text"
                    id="clientName"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-xl border px-4 py-3 text-right focus:outline-none focus:ring-2"
                    style={{ 
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 2px rgba(0, 0, 0, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.boxShadow = "none";
                    }}
                    placeholder="הזינו את שמכם המלא"
                  />
                </div>

                <div>
                  <label
                    htmlFor="clientPhone"
                    className="block text-sm font-medium mb-2 text-right"
                    style={{ color: "var(--text)" }}
                  >
                    טלפון *
                  </label>
                  <input
                    type="tel"
                    id="clientPhone"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full rounded-xl border px-4 py-3 text-right focus:outline-none focus:ring-2"
                    style={{ 
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 2px rgba(0, 0, 0, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.boxShadow = "none";
                    }}
                    placeholder="050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="clientNote"
                    className="block text-sm font-medium mb-2 text-right"
                    style={{ color: "var(--text)" }}
                  >
                    הערה (אופציונלי)
                  </label>
                  <textarea
                    id="clientNote"
                    value={clientNote}
                    onChange={(e) => setClientNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border px-4 py-3 text-right focus:outline-none focus:ring-2 resize-none"
                    style={{ 
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--primary)";
                      e.target.style.boxShadow = "0 0 0 2px rgba(0, 0, 0, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.boxShadow = "none";
                    }}
                    placeholder="השאירו הערות או בקשות מיוחדות..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 pt-6 border-t flex justify-between gap-4" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="px-6 py-3 border rounded-xl font-medium transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                borderColor: "var(--border)",
                color: "var(--text)",
                backgroundColor: "transparent",
              }}
            >
              חזור
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStepValid()}
                className="px-6 py-3 rounded-xl font-semibold transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: "var(--primary)",
                  color: "var(--primaryText)",
                }}
              >
                המשך
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isStepValid() || isSubmitting}
                className="px-6 py-3 rounded-xl font-semibold transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: "#10b981",
                  color: "var(--primaryText)",
                }}
              >
                {isSubmitting ? "שומר…" : "אשר הזמנה"}
              </button>
            )}
          </div>

          {submitError && (
            <div className="mt-4 p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
              <p className="text-sm" style={{ color: "#991b1b" }}>{submitError}</p>
            </div>
          )}

          {!isStepValid() && step < 6 && (
            <div className="mt-4 p-3 border rounded-xl text-right" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
              <p className="text-sm" style={{ color: "#991b1b" }}>
                יש למלא את כל השדות הנדרשים לפני המשך
              </p>
            </div>
          )}
        </div>
        
        {/* Debug info */}
        <div className="mt-4 p-2 bg-slate-100 rounded text-xs text-slate-600 text-right">
          siteId: {siteId}
        </div>
      </div>
    </div>
  );
}

