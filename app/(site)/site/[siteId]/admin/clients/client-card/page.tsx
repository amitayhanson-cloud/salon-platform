"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { query, where, orderBy, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { bookingsCollection } from "@/lib/firestorePaths";
import { ChemicalCard } from "./ChemicalCard";
import { AdminTabs } from "@/components/ui/AdminTabs";

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

interface ServiceHistory {
  serviceName: string;
  serviceType?: string | null;
  count: number;
  lastDate: string; // YYYY-MM-DD
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
  type TabType = "bookings" | "services" | "chemistry";
  const [activeTab, setActiveTab] = useState<TabType>("bookings");

  // Extract clientId from URL as a primitive (stable dependency)
  const clientIdFromUrl = searchParams.get("clientId");
  
  // Reset tab to default when client changes
  useEffect(() => {
    if (selectedClientId) {
      setActiveTab("bookings");
    }
  }, [selectedClientId]);

  // Initialize selected client from URL query param (only when URL param changes)
  useEffect(() => {
    if (clientIdFromUrl && clientIdFromUrl !== selectedClientId) {
      setSelectedClientId(clientIdFromUrl);
    }
  }, [clientIdFromUrl]); // Only depend on the primitive value, not the searchParams object

  // Load all bookings to extract unique clients
  useEffect(() => {
    if (!db || !siteId) return;

    setClientsLoading(true);
    setClientsError(null);

    let bookingsQuery;
    try {
      bookingsQuery = query(bookingsCollection(siteId), orderBy("createdAt", "desc"));
    } catch (e) {
      // If orderBy fails (missing index), try without it
      bookingsQuery = bookingsCollection(siteId);
    }

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        try {
          // Extract unique clients from bookings
          const clientMap = new Map<string, Client>();
          
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const phone = data.customerPhone || "";
            const name = data.customerName || "";
            
            if (!phone || !name) return; // Skip bookings without phone/name
            
            if (!clientMap.has(phone)) {
              // First booking for this client
              const createdAt = data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString();
              clientMap.set(phone, {
                id: phone,
                name,
                phone,
                email: data.customerEmail || undefined,
                createdAt,
                lastVisit: data.date || undefined,
                totalBookings: 1,
              });
            } else {
              // Update existing client
              const client = clientMap.get(phone)!;
              client.totalBookings += 1;
              
              // Update lastVisit if this booking is more recent
              const bookingDate = data.date || "";
              if (bookingDate && (!client.lastVisit || bookingDate > client.lastVisit)) {
                client.lastVisit = bookingDate;
              }
              
              // Update createdAt if this booking is older
              const bookingCreatedAt = data.createdAt?.toDate?.()?.toISOString() || data.createdAt;
              if (bookingCreatedAt && client.createdAt && bookingCreatedAt < client.createdAt) {
                client.createdAt = bookingCreatedAt;
              }
            }
          });
          
          const clientsList = Array.from(clientMap.values()).sort((a, b) => {
            // Sort by name (Hebrew-friendly)
            return a.name.localeCompare(b.name);
          });
          
          setClients(clientsList);
        } catch (err) {
          console.error("[ClientCard] Failed to process clients", err);
          setClientsError("שגיאה בעיבוד רשימת הלקוחות");
        } finally {
          setClientsLoading(false);
        }
      },
      (err) => {
        console.error("[ClientCard] Failed to load bookings for clients", err);
        setClientsError("שגיאה בטעינת הלקוחות");
        setClientsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [siteId]); // Only depend on siteId - this effect should run once per site

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

  // Calculate service history from bookings
  const serviceHistory = useMemo(() => {
    const serviceMap = new Map<string, ServiceHistory>();
    
    clientBookings.forEach((booking) => {
      const key = booking.serviceType
        ? `${booking.serviceName} - ${booking.serviceType}`
        : booking.serviceName;
      
      if (!serviceMap.has(key)) {
        serviceMap.set(key, {
          serviceName: booking.serviceName,
          serviceType: booking.serviceType || null,
          count: 1,
          lastDate: booking.date,
        });
      } else {
        const history = serviceMap.get(key)!;
        history.count += 1;
        if (booking.date > history.lastDate) {
          history.lastDate = booking.date;
        }
      }
    });
    
    return Array.from(serviceMap.values()).sort((a, b) => {
      // Sort by count (most frequent first), then by last date
      if (b.count !== a.count) return b.count - a.count;
      return b.lastDate.localeCompare(a.lastDate);
    });
  }, [clientBookings]);

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    // Update URL without page reload
    const url = new URL(window.location.href);
    url.searchParams.set("clientId", clientId);
    window.history.pushState({}, "", url.toString());
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
              <h2 className="text-lg font-bold text-slate-900 mb-4">רשימת לקוחות</h2>
              
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
                <AdminTabs
                  tabs={[
                    { key: "bookings", label: "היסטוריית תורים" },
                    ...(serviceHistory.length > 0 ? [{ key: "services", label: "היסטוריית שירותים" }] : []),
                    { key: "chemistry", label: "כרטיס כימיה" },
                  ]}
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

                  {/* Service History Tab */}
                  {activeTab === "services" && (
                    <div>
                      {serviceHistory.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">אין היסטוריית שירותים</p>
                      ) : (
                        <div className="space-y-2">
                          {serviceHistory.map((service, index) => (
                            <div
                              key={index}
                              className="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
                            >
                              <div>
                                <p className="font-medium text-slate-900">
                                  {service.serviceType
                                    ? `${service.serviceName} - ${service.serviceType}`
                                    : service.serviceName}
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                  ביקור אחרון: {new Date(service.lastDate + "T00:00:00").toLocaleDateString("he-IL")}
                                </p>
                              </div>
                              <span className="text-sm font-semibold text-slate-700">
                                {service.count} פעמים
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chemical Card Tab */}
                  {activeTab === "chemistry" && (
                    <div>
                      <ChemicalCard siteId={siteId} clientId={selectedClient.id} />
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
    </div>
  );
}
