"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { query, where, orderBy, onSnapshot, getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { bookingsCollection } from "@/lib/firestorePaths";
import { ChemicalCard } from "./ChemicalCard";
import PersonalPricingTab from "./PersonalPricingTab";
import AdminTabs from "@/components/ui/AdminTabs";
import { createClient, checkClientExists, type ClientData } from "@/lib/firestoreClients";


interface Client {
  id: string; // phone number (unique identifier)
  name: string;
  phone: string;
  email?: string;
  lastVisit?: string; // ISO date string
  createdAt?: string; // ISO date string
  totalBookings: number;
}

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  serviceType?: string | null;
  workerName?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: string;
  createdAt?: any; // Timestamp or ISO string
  note?: string;
  price?: number; // If available
}

export default function ClientCardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const siteId = params?.siteId as string;
  
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);
  
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientBookings, setClientBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  
  // Tab state for client details sections
  type TabType = "chemistry" | "bookings" | "pricing";
  const [activeTab, setActiveTab] = useState<TabType>("chemistry");

  // Add Client Modal State
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);
  const [clientFormError, setClientFormError] = useState<string | null>(null);
  const [clientFormSuccess, setClientFormSuccess] = useState(false);
  const [existingClientData, setExistingClientData] = useState<ClientData | null>(null);

  // Extract clientId from URL as a primitive (stable dependency)
  const clientIdFromUrl = searchParams.get("clientId");

  // Reset tab to default when client changes
  useEffect(() => {
    if (selectedClientId) {
      setActiveTab("chemistry");
    }
  }, [selectedClientId]);

  // Initialize selected client from URL query param (only when URL param changes)
  useEffect(() => {
    if (clientIdFromUrl && clientIdFromUrl !== selectedClientId) {
      setSelectedClientId(clientIdFromUrl);
    }
  }, [clientIdFromUrl]); // Only depend on the primitive value, not the searchParams object

  // Load clients list ONLY from sites/{siteId}/clients. No merge with bookings; no fallbacks.
  // State is REPLACED on every snapshot so deleted docs disappear immediately.
  useEffect(() => {
    if (!db || !siteId) return;

    setClientsLoading(true);
    setClientsError(null);

    const clientsPath = `sites/${siteId}/clients`;
    const clientsRef = collection(db, "sites", siteId, "clients");
    const clientsQuery = query(clientsRef);

    const unsubscribe = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const docIds = snapshot.docs.map((d) => d.id);
        console.log("[ClientCard] clients snapshot", {
          path: clientsPath,
          fromCache: snapshot.metadata?.fromCache ?? "unknown",
          size: snapshot.size,
          docIds,
        });

        // REPLACE state entirely from this snapshot (no append, no merge with bookings or previous state)
        const mapped = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          if (data.archived === true) return null;
          const phone = (data.phone || docSnap.id || "").replace(/\s|-|\(|\)/g, "") || docSnap.id;
          return {
            id: docSnap.id,
            name: data.name || "",
            phone,
            email: data.email || undefined,
            lastVisit: undefined,
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === "string" ? data.createdAt : undefined),
            totalBookings: 0,
          };
        });
        const list = mapped.filter((c) => c !== null).sort((a, b) => a.name.localeCompare(b.name)) as Client[];

        setClients(list);
        setClientsLoading(false);
      },
      (err) => {
        console.error("[ClientCard] Failed to subscribe to clients collection", err);
        setClientsError("שגיאה בטעינת הלקוחות");
        setClientsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load bookings for selected client
  useEffect(() => {
    if (!db || !siteId || !selectedClientId) {
      setClientBookings([]);
      setBookingsLoading(false);
      setBookingsError(null);
      return;
    }

    // Use a cancellation flag to prevent state updates after unmount or client change
    let cancelled = false;

    setBookingsLoading(true);
    setBookingsError(null);

    let bookingsQuery;
    try {
      bookingsQuery = query(
        bookingsCollection(siteId),
        where("customerPhone", "==", selectedClientId),
        orderBy("date", "desc")
      );
    } catch (e) {
      // If orderBy fails, try without it
      try {
        bookingsQuery = query(
          bookingsCollection(siteId),
          where("customerPhone", "==", selectedClientId)
        );
      } catch (e2) {
        // If query fails completely, fetch all and filter client-side
        bookingsQuery = bookingsCollection(siteId);
      }
    }

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        if (cancelled) return; // Don't update if cancelled
        
        try {
          const bookings: Booking[] = [];
          
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            
            // If we couldn't use where clause, filter client-side
            if (data.customerPhone !== selectedClientId) return;
            
            bookings.push({
              id: doc.id,
              customerName: data.customerName || "",
              customerPhone: data.customerPhone || "",
              serviceName: data.serviceName || "",
              serviceType: data.serviceType || null,
              workerName: data.workerName || null,
              date: data.date || data.dateISO || "",
              time: data.time || data.timeHHmm || "",
              status: data.status || "confirmed",
              createdAt: data.createdAt,
              note: data.note || undefined,
              price: data.price || undefined,
            });
          });
          
          // Sort by date (newest first), then by time
          bookings.sort((a, b) => {
            const dateCompare = (b.date || "").localeCompare(a.date || "");
            if (dateCompare !== 0) return dateCompare;
            return (b.time || "").localeCompare(a.time || "");
          });
          
          if (!cancelled) {
            setClientBookings(bookings);
            setBookingsLoading(false);
          }
        } catch (err) {
          console.error("[ClientCard] Failed to process bookings", err);
          if (!cancelled) {
            setBookingsError("שגיאה בעיבוד התורים");
            setBookingsLoading(false);
          }
        }
      },
      (err) => {
        if (cancelled) return; // Don't update if cancelled
        
        console.error("[ClientCard] Failed to load bookings", err);
        // If index is missing, show helpful error (don't retry in loop)
        if (err.message?.includes("index") || err.code === "failed-precondition") {
          setBookingsError("נדרש אינדקס ב-Firestore. אנא צור אינדקס עבור customerPhone + date.");
        } else {
          setBookingsError("שגיאה בטעינת התורים");
        }
        setBookingsLoading(false);
        setClientBookings([]);
      }
    );

    return () => {
      cancelled = true; // Mark as cancelled on cleanup
      unsubscribe();
    };
  }, [siteId, selectedClientId]); // Only depend on primitives

  // Derive selected client from ID and clients list (useMemo prevents loops)
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  // Filter clients by search query
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter((client) =>
      client.name.toLowerCase().includes(query) ||
      client.phone.includes(query)
    );
  }, [clients, searchQuery]);


  // Build tabs array with proper typing - "chemistry" is first (default)
  const clientTabs = useMemo<Array<{ key: TabType; label: string }>>(() => {
    return [
      { key: "chemistry" as TabType, label: "כימיה" },
      { key: "bookings" as TabType, label: "היסטוריית תורים" },
      { key: "pricing" as TabType, label: "תמחור אישי" },
    ];
  }, []);

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    // Update URL without page reload
    const url = new URL(window.location.href);
    url.searchParams.set("clientId", clientId);
    window.history.pushState({}, "", url.toString());
  };

  // Handle Add Client Modal
  const handleOpenAddClientModal = () => {
    setIsAddClientModalOpen(true);
    setNewClientForm({ name: "", phone: "", email: "", notes: "" });
    setClientFormError(null);
    setClientFormSuccess(false);
    setExistingClientData(null);
  };

  const handleCloseAddClientModal = () => {
    setIsAddClientModalOpen(false);
    setNewClientForm({ name: "", phone: "", email: "", notes: "" });
    setClientFormError(null);
    setClientFormSuccess(false);
    setExistingClientData(null);
  };

  const handleClientFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewClientForm((prev) => ({ ...prev, [name]: value }));
    setClientFormError(null);
    setClientFormSuccess(false);
  };

  const validatePhone = (phone: string): boolean => {
    // Remove spaces, dashes, parentheses for validation
    const normalized = phone.replace(/\s|-|\(|\)/g, "");
    // Israeli phone: 9-10 digits, may start with 0 or country code
    return /^(\+972|0)?[1-9]\d{8}$/.test(normalized) || normalized.length >= 9;
  };

  const handleSubmitNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientFormError(null);
    setClientFormSuccess(false);
    setExistingClientData(null);

    // Validation
    if (!newClientForm.name.trim()) {
      setClientFormError("שם הלקוח הוא שדה חובה");
      return;
    }

    if (!newClientForm.phone.trim()) {
      setClientFormError("מספר טלפון הוא שדה חובה");
      return;
    }

    // Basic phone format check
    if (!validatePhone(newClientForm.phone)) {
      setClientFormError("מספר טלפון לא תקין. אנא הזן מספר טלפון תקין");
      return;
    }

    // Email validation (if provided)
    if (newClientForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClientForm.email)) {
      setClientFormError("כתובת אימייל לא תקינה");
      return;
    }

    setIsSubmittingClient(true);

    try {
      // Check if client already exists
      const normalizedPhone = newClientForm.phone.replace(/\s|-|\(|\)/g, "");
      const existing = await checkClientExists(siteId, normalizedPhone);

      if (existing.exists && existing.clientData) {
        // Client exists - show option to view existing
        setExistingClientData(existing.clientData);
        setClientFormError(`לקוח עם מספר טלפון ${normalizedPhone} כבר קיים במערכת`);
        setIsSubmittingClient(false);
        return;
      }

      // Create new client
      await createClient(siteId, {
        name: newClientForm.name.trim(),
        phone: normalizedPhone,
        email: newClientForm.email.trim() || undefined,
        notes: newClientForm.notes.trim() || undefined,
      });

      setClientFormSuccess(true);
      
      // Reset form and close modal after a short delay
      setTimeout(() => {
        handleCloseAddClientModal();
        // Refresh clients list by selecting the new client
        handleClientSelect(normalizedPhone);
      }, 1500);
    } catch (error: any) {
      console.error("[AddClient] Error creating client", error);
      if (error.message === "CLIENT_EXISTS") {
        setClientFormError("לקוח עם מספר טלפון זה כבר קיים במערכת");
      } else {
        setClientFormError(`שגיאה ביצירת הלקוח: ${error.message || "שגיאה לא ידועה"}`);
      }
    } finally {
      setIsSubmittingClient(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">כרטיס לקוח</h1>
          <p className="text-sm text-slate-500 mt-1">
            ניהול לקוחות והיסטוריית תורים
          </p>
        </div>

        {clientsError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{clientsError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Clients List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-900">רשימת לקוחות</h2>
                <button
                  onClick={handleOpenAddClientModal}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  הוסף/י לקוח
                </button>
              </div>
              
              {/* Search Input */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="חפש לפי שם או טלפון..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>

              {clientsLoading ? (
                <p className="text-sm text-slate-500 text-center py-8">טוען לקוחות…</p>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500 mb-2">
                    {searchQuery ? "לא נמצאו לקוחות התואמים לחיפוש" : "אין לקוחות רשומים"}
                  </p>
                  {!searchQuery && (
                    <p className="text-xs text-slate-400">
                      לקוחות יופיעו כאן לאחר יצירת תורים
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleClientSelect(client.id)}
                      className={`w-full text-right p-3 rounded-lg border transition-colors ${
                        selectedClientId === client.id
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900">{client.name}</h3>
                          <p className="text-xs text-slate-600 mt-1">{client.phone}</p>
                        </div>
                        {client.totalBookings > 0 && (
                          <span className="text-xs text-slate-400 mr-2">
                            {client.totalBookings} תורים
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Client Details Card */}
          <div className="lg:col-span-2">
            {selectedClient ? (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">פרטי לקוח</h2>

                {/* Client Details */}
                <div className="border-b border-slate-200 pb-6 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">שם</label>
                      <p className="text-base text-slate-900">{selectedClient.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">טלפון</label>
                      <p className="text-base text-slate-900">{selectedClient.phone}</p>
                    </div>
                    {selectedClient.email && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label>
                        <p className="text-base text-slate-900">{selectedClient.email}</p>
                      </div>
                    )}
                    {selectedClient.lastVisit && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">ביקור אחרון</label>
                        <p className="text-base text-slate-900">
                          {new Date(selectedClient.lastVisit + "T00:00:00").toLocaleDateString("he-IL")}
                        </p>
                      </div>
                    )}
                    {selectedClient.createdAt && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">לקוח מאז</label>
                        <p className="text-base text-slate-900">
                          {new Date(selectedClient.createdAt).toLocaleDateString("he-IL")}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">סה"כ תורים</label>
                      <p className="text-base text-slate-900">{selectedClient.totalBookings}</p>
                    </div>
                  </div>
                </div>

                {/* Tabs Navigation */}
                <AdminTabs<TabType>
                  tabs={clientTabs}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                />

                {/* Tab Content */}
                <div>
                  {/* Booking History Tab */}
                  {activeTab === "bookings" && (
                    <div>
                      {bookingsError && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-right">
                          <p className="text-sm text-yellow-700">{bookingsError}</p>
                        </div>
                      )}

                      {bookingsLoading ? (
                        <p className="text-sm text-slate-500 text-center py-8">טוען תורים…</p>
                      ) : clientBookings.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">אין תורים רשומים</p>
                      ) : (
                        <div className="space-y-3">
                          {clientBookings.map((booking) => (
                            <div
                              key={booking.id}
                              className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow"
                            >
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <span className="text-slate-600">תאריך:</span>{" "}
                                  <span className="font-medium">
                                    {new Date(booking.date + "T00:00:00").toLocaleDateString("he-IL")}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-600">שעה:</span>{" "}
                                  <span className="font-medium">{booking.time || "N/A"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-600">שירות:</span>{" "}
                                  <span className="font-medium">
                                    {booking.serviceType
                                      ? `${booking.serviceName} - ${booking.serviceType}`
                                      : booking.serviceName}
                                  </span>
                                </div>
                                {booking.workerName && (
                                  <div>
                                    <span className="text-slate-600">עובד:</span>{" "}
                                    <span className="font-medium">{booking.workerName}</span>
                                  </div>
                                )}
                                {booking.note && (
                                  <div className="md:col-span-4">
                                    <span className="text-slate-600">הערה:</span>{" "}
                                    <span className="font-medium">{booking.note}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-600">סטטוס:</span>{" "}
                                  <span
                                    className={`font-medium ${
                                      booking.status === "confirmed"
                                        ? "text-emerald-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {booking.status === "confirmed" ? "מאושר" : "בוטל"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chemical Card Tab */}
                  {activeTab === "chemistry" && (
                    <div>
                      <ChemicalCard siteId={siteId} phone={selectedClient.id} />
                    </div>
                  )}

                  {/* Personal Pricing Tab */}
                  {activeTab === "pricing" && (
                    <div>
                      <PersonalPricingTab siteId={siteId} phone={selectedClient.id} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-2">בחר לקוח מהרשימה</p>
                  <p className="text-sm text-slate-400">
                    פרטי הלקוח והיסטוריית התורים יופיעו כאן
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Client Modal */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">הוסף/י לקוח חדש</h2>
                <button
                  onClick={handleCloseAddClientModal}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {clientFormSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-right">
                  <p className="text-sm text-green-700">הלקוח נוצר בהצלחה!</p>
                </div>
              )}

              {clientFormError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                  <p className="text-sm text-red-700">{clientFormError}</p>
                  {existingClientData && (
                    <button
                      onClick={() => {
                        handleCloseAddClientModal();
                        handleClientSelect(existingClientData.phone.replace(/\s|-|\(|\)/g, ""));
                      }}
                      className="mt-2 text-sm text-sky-600 hover:text-sky-700 underline"
                    >
                      פתח לקוח קיים
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmitNewClient} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                    שם מלא <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={newClientForm.name}
                    onChange={handleClientFormChange}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    placeholder="לדוגמה: יוסי כהן"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                    מספר טלפון <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={newClientForm.phone}
                    onChange={handleClientFormChange}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    placeholder="לדוגמה: 050-1234567"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    אימייל
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={newClientForm.email}
                    onChange={handleClientFormChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    placeholder="לדוגמה: client@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
                    הערות
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={newClientForm.notes}
                    onChange={handleClientFormChange}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm resize-none"
                    placeholder="הערות נוספות על הלקוח..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseAddClientModal}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingClient}
                    className="flex-1 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingClient ? "שומר..." : "שמור"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
