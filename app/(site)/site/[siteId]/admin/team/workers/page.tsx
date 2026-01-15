"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  workersCollection,
  workerDoc,
} from "@/lib/firestorePaths";
import { subscribeServices } from "@/lib/firestoreServices";
import { AdminTabs } from "@/components/ui/AdminTabs";
import type { Service } from "@/types/service";
import type { OpeningHours } from "@/types/booking";

interface Worker {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  services?: string[];
  availability?: OpeningHours[];
  active: boolean;
  createdAt: string;
}

const DAY_LABELS: Record<string, string> = {
  "0": "ראשון",
  "1": "שני",
  "2": "שלישי",
  "3": "רביעי",
  "4": "חמישי",
  "5": "שישי",
  "6": "שבת",
};

const WEEKDAYS: Array<{ day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"; label: string }> = [
  { day: "sun", label: "ראשון" },
  { day: "mon", label: "שני" },
  { day: "tue", label: "שלישי" },
  { day: "wed", label: "רביעי" },
  { day: "thu", label: "חמישי" },
  { day: "fri", label: "שישי" },
  { day: "sat", label: "שבת" },
];

const defaultAvailability: OpeningHours[] = WEEKDAYS.map((w) => ({
  day: w.day,
  label: w.label,
  open: w.day === "sat" ? null : "09:00", // Closed on Saturday by default
  close: w.day === "sat" ? null : "18:00",
}));

export default function WorkersPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  
  // Tab state for worker details
  type WorkerTabType = "details" | "availability" | "services";
  const [activeWorkerTab, setActiveWorkerTab] = useState<WorkerTabType>("details");
  
  // Reset tab when worker changes
  useEffect(() => {
    if (selectedWorkerId) {
      setActiveWorkerTab("details");
    }
  }, [selectedWorkerId]);
  
  // Services from Firestore (same source as Pricing/Services page)
  const [services, setServices] = useState<Service[]>([]);

  // Selected worker form state
  const [formData, setFormData] = useState<Partial<Worker>>({
    name: "",
    role: "",
    phone: "",
    email: "",
    services: [],
    availability: defaultAvailability,
    active: true,
  });

  // Load services from Firestore (same source as Pricing/Services page)
  useEffect(() => {
    if (!siteId) return;

    const unsubscribeServices = subscribeServices(
      siteId,
      (svcs) => {
        // Only show active services
        const activeServices = svcs.filter((s) => s.active !== false);
        setServices(activeServices);
      },
      (err) => {
        console.error("[Workers] Failed to load services", err);
        setServices([]);
      }
    );

    return () => {
      unsubscribeServices();
    };
  }, [siteId]);

  // Load workers
  useEffect(() => {
    if (!db || !siteId) return;

    setWorkersLoading(true);
    setWorkersError(null);

    let workersQuery;
    try {
      workersQuery = query(workersCollection(siteId), orderBy("createdAt", "asc"));
    } catch (e) {
      workersQuery = workersCollection(siteId);
    }

    const workersUnsubscribe = onSnapshot(
      workersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => {
          const data = d.data();
          // Ensure availability is properly formatted
          let availability = defaultAvailability;
          if (data.availability && Array.isArray(data.availability)) {
            // Map loaded availability to ensure it matches OpeningHours structure
            availability = data.availability.map((day: any, idx: number) => ({
              day: day.day || WEEKDAYS[idx]?.day || "sun",
              label: day.label || WEEKDAYS[idx]?.label || "",
              open: day.open || null,
              close: day.close || null,
            })) as OpeningHours[];
            // Ensure we have all 7 days
            if (availability.length !== 7) {
              availability = defaultAvailability;
            }
          }
          return {
            id: d.id,
            name: data.name || "",
            role: data.role || "",
            phone: data.phone || "",
            email: data.email || "",
            services: data.services || [],
            availability,
            active: data.active !== false,
            createdAt: data.createdAt || new Date().toISOString(),
          } as Worker;
        });
        setWorkers(items);
        setWorkersLoading(false);
        setWorkersError(null);
      },
      (err) => {
        console.error("[Workers] Failed to load workers", err);
        setWorkersError(err.message);
        setWorkersLoading(false);
        setWorkers([]);
      }
    );

    return () => {
      workersUnsubscribe();
    };
  }, [siteId]);

  // Load selected worker data into form
  useEffect(() => {
    if (selectedWorkerId) {
      const worker = workers.find((w) => w.id === selectedWorkerId);
      if (worker) {
        setFormData({
          name: worker.name || "",
          role: worker.role || "",
          phone: worker.phone || "",
          email: worker.email || "",
          services: worker.services || [],
          availability: worker.availability || defaultAvailability,
          active: worker.active !== false,
        });
      }
    } else {
      // Reset form for new worker
      setFormData({
        name: "",
        role: "",
        phone: "",
        email: "",
        services: [],
        availability: defaultAvailability,
        active: true,
      });
    }
  }, [selectedWorkerId, workers]);

  const handleAddWorker = async () => {
    if (!db || !siteId || !formData.name?.trim()) {
      setError("יש להזין שם עובד");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const newWorker = {
        name: formData.name.trim(),
        role: formData.role?.trim() || null,
        phone: formData.phone?.trim() || null,
        email: formData.email?.trim() || null,
        services: formData.services || [],
        availability: formData.availability || defaultAvailability,
        active: formData.active !== false,
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(workersCollection(siteId), newWorker);
      setSelectedWorkerId(docRef.id);
      setSaveMessage("עובד נוסף בהצלחה");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      console.error("[Workers] Failed to add worker", err);
      setError("שגיאה בהוספת עובד");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorker = async () => {
    if (!db || !siteId || !selectedWorkerId || !formData.name?.trim()) {
      setError("יש להזין שם עובד");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await updateDoc(workerDoc(siteId, selectedWorkerId), {
        name: formData.name.trim(),
        role: formData.role?.trim() || null,
        phone: formData.phone?.trim() || null,
        email: formData.email?.trim() || null,
        services: formData.services || [],
        availability: formData.availability || defaultAvailability,
        active: formData.active !== false,
      });
      setSaveMessage("השינויים נשמרו בהצלחה");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      console.error("[Workers] Failed to update worker", err);
      setError("שגיאה בשמירת השינויים");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorker = async () => {
    if (!db || !siteId || !selectedWorkerId) return;
    if (!confirm("האם אתה בטוח שברצונך למחוק את העובד?")) return;
    try {
      await deleteDoc(workerDoc(siteId, selectedWorkerId));
      setSelectedWorkerId(null);
      setError(null);
    } catch (err) {
      console.error("[Workers] Failed to delete worker", err);
      setError("שגיאה במחיקת עובד");
    }
  };

  const toggleService = (serviceId: string) => {
    const current = formData.services || [];
    if (current.includes(serviceId)) {
      setFormData({ ...formData, services: current.filter((s) => s !== serviceId) });
    } else {
      setFormData({ ...formData, services: [...current, serviceId] });
    }
  };

  // Helper: Convert old service names to IDs (backward compatibility)
  // If a worker has service names (strings) that match service.name, convert them to service.name (which is the ID)
  // This ensures backward compatibility with workers that have old service names stored
  const normalizeWorkerServices = (workerServices: string[]): string[] => {
    if (!workerServices || workerServices.length === 0) return [];
    if (services.length === 0) return workerServices; // No services loaded yet, keep as-is
    
    // Check if services are already IDs (match service.name) or old names
    return workerServices.map((serviceValue) => {
      // Try to find a service with matching name (service.name is the ID)
      const matchingService = services.find((s) => s.name === serviceValue);
      if (matchingService) {
        // Already an ID (service.name), return as-is
        return matchingService.name;
      }
      // If not found, it might be a legacy name or invalid service
      // For now, keep it (will be filtered out on next save if service doesn't exist)
      return serviceValue;
    }).filter((id) => {
      // Filter out any IDs that don't match existing services
      return services.some((s) => s.name === id);
    });
  };

  const updateAvailability = (dayIndex: number, field: "open" | "close", value: string | null) => {
    const availability = [...(formData.availability || defaultAvailability)];
    availability[dayIndex] = {
      ...availability[dayIndex],
      [field]: value,
    };
    setFormData({ ...formData, availability });
  };

  const toggleDayAvailability = (dayIndex: number) => {
    const availability = [...(formData.availability || defaultAvailability)];
    const day = availability[dayIndex];
    const isClosed = !day.open && !day.close;
    if (isClosed) {
      availability[dayIndex] = {
        ...day,
        open: "09:00",
        close: "18:00",
      };
    } else {
      availability[dayIndex] = {
        ...day,
        open: null,
        close: null,
      };
    }
    setFormData({ ...formData, availability });
  };

  // Use services from Firestore (same source as Pricing/Services page)
  // Services are already filtered to active only

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">עובדים</h1>
          <p className="text-sm text-slate-500 mt-1">
            ניהול עובדים, שירותים וזמינות
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {saveMessage && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-right">
            <p className="text-sm text-emerald-700">{saveMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workers List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-900">רשימת עובדים</h2>
                <button
                  onClick={() => setSelectedWorkerId(null)}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  + הוסף עובד
                </button>
              </div>

              {workersLoading ? (
                <p className="text-sm text-slate-500 text-center py-8">טוען עובדים…</p>
              ) : workers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">אין עובדים רשומים</p>
              ) : (
                <div className="space-y-2">
                  {workers.map((worker) => (
                    <button
                      key={worker.id}
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className={`w-full text-right p-3 rounded-lg border transition-colors ${
                        selectedWorkerId === worker.id
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900">{worker.name}</h3>
                          {worker.role && (
                            <p className="text-xs text-slate-600">{worker.role}</p>
                          )}
                        </div>
                        {!worker.active && (
                          <span className="text-xs text-slate-400">לא פעיל</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Worker Details Card */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              {!selectedWorkerId ? (
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-4">עובד חדש</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        שם עובד *
                      </label>
                      <input
                        type="text"
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="הזן שם עובד"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        תפקיד (אופציונלי)
                      </label>
                      <input
                        type="text"
                        value={formData.role || ""}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="למשל: מעצב ראשי"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddWorker}
                        disabled={saving || !formData.name?.trim()}
                        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                      >
                        {saving ? "שומר..." : "שמור עובד"}
                      </button>
                      <button
                        onClick={() => setFormData({ name: "", role: "", phone: "", email: "", services: [], availability: defaultAvailability, active: true })}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium"
                      >
                        נקה
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-900">פרטי עובד</h2>
                    <button
                      onClick={handleDeleteWorker}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
                    >
                      מחק עובד
                    </button>
                  </div>

                  <AdminTabs
                    tabs={[
                      { key: "details", label: "פרטים" },
                      { key: "availability", label: "זמינות" },
                      { key: "services", label: "שירותים" },
                    ]}
                    activeKey={activeWorkerTab}
                    onChange={(key) => setActiveWorkerTab(key as WorkerTabType)}
                  />

                  {/* Tab Content */}
                  <div>
                    {/* Details Tab */}
                    {activeWorkerTab === "details" && (
                      <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        שם עובד *
                      </label>
                      <input
                        type="text"
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        תפקיד
                      </label>
                      <input
                        type="text"
                        value={formData.role || ""}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        טלפון
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ""}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="050-1234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        אימייל
                      </label>
                      <input
                        type="email"
                        value={formData.email || ""}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="worker@example.com"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.active !== false}
                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                        className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                      />
                      <label className="text-sm font-medium text-slate-700">פעיל</label>
                    </div>
                      </div>
                    )}

                    {/* Availability Tab */}
                    {activeWorkerTab === "availability" && (
                      <div>
                        <div className="space-y-3">
                          {(formData.availability || defaultAvailability).map((day, index) => {
                            const isClosed = !day.open && !day.close;
                            return (
                              <div
                                key={day.day}
                                className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg"
                              >
                                <div className="w-20 text-sm font-medium text-slate-700">
                                  {day.label}
                                </div>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={!isClosed}
                                    onChange={() => toggleDayAvailability(index)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                                  />
                                  <span className="text-xs text-slate-600">פעיל</span>
                                </label>
                                {!isClosed && (
                                  <>
                                    <input
                                      type="time"
                                      value={day.open || ""}
                                      onChange={(e) => updateAvailability(index, "open", e.target.value)}
                                      className="px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    />
                                    <span className="text-xs text-slate-600">עד</span>
                                    <input
                                      type="time"
                                      value={day.close || ""}
                                      onChange={(e) => updateAvailability(index, "close", e.target.value)}
                                      className="px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    />
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Services Tab */}
                    {activeWorkerTab === "services" && (
                      <div>
                        {services.length === 0 ? (
                          <p className="text-sm text-slate-500">אין שירותים מוגדרים. הוסף שירותים בעמוד המחירון.</p>
                        ) : (
                          <div className="space-y-2">
                            {services.map((service) => {
                              // Use service.name as the ID (same as Pricing/Services page)
                              const serviceId = service.name;
                              const isChecked = (formData.services || []).includes(serviceId);
                              
                              return (
                                <label
                                  key={service.id}
                                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleService(serviceId)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                                  />
                                  <span className="text-sm text-slate-700">{service.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Save Button */}
                  <div className="border-t border-slate-200 pt-4">
                    <button
                      onClick={handleSaveWorker}
                      disabled={saving || !formData.name?.trim()}
                      className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                    >
                      {saving ? "שומר..." : "שמור שינויים"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
