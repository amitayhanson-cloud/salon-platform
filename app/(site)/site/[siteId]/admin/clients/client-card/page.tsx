"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { query, where, orderBy, onSnapshot, collection } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { bookingsCollection } from "@/lib/firestorePaths";
import { ChemicalCard } from "./ChemicalCard";
import PersonalPricingTab from "./PersonalPricingTab";
import AdminTabs from "@/components/ui/AdminTabs";
import { createClient, checkClientExists, type ClientData } from "@/lib/firestoreClients";
import { subscribeClientTypes } from "@/lib/firestoreClientSettings";
import { DEFAULT_CLIENT_TYPE_ENTRIES, REGULAR_CLIENT_TYPE_ID } from "@/types/bookingSettings";
import type { ClientTypeEntry } from "@/types/bookingSettings";
import { getLastConfirmedPastAppointment } from "@/lib/lastConfirmedAppointment";
import { getDisplayStatus } from "@/lib/bookingRootStatus";
import { useAuth } from "@/components/auth/AuthProvider";
import { MoreVertical, Pencil, Trash2, CheckSquare, Square } from "lucide-react";

interface Client {
  id: string; // phone number (unique identifier)
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  /** Legacy label; prefer clientTypeId. */
  clientType: string;
  /** Client type id (e.g. "regular"). Default when missing is regular. */
  clientTypeId?: string;
  clientNotes?: string;
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
  durationMin?: number;
  status: string;
  createdAt?: any; // Timestamp or ISO string
  note?: string;
  price?: number; // If available
  /** Soft-deleted from calendar; still shown in client history */
  isArchived?: boolean;
  archivedAt?: any; // Timestamp or ISO string
  archivedReason?: "manual" | "auto" | "customer_cancelled_via_whatsapp";
  whatsappStatus?: string;
}

export default function ClientCardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();

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

  // Actions menu (list row) - uses portal for correct layering
  const [actionsOpenForId, setActionsOpenForId] = useState<string | null>(null);
  const [actionsMenuClient, setActionsMenuClient] = useState<Client | null>(null);
  const [actionsMenuRect, setActionsMenuRect] = useState<{ top: number; right: number } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  // Edit modal
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", clientTypeId: "", clientNotes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Selection for bulk delete
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  // Bulk delete modal
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState<"client_only" | "client_and_bookings">("client_only");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Delete modal
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleteMode, setDeleteMode] = useState<"client_only" | "client_and_bookings">("client_only");
  const [deleteBookingCount, setDeleteBookingCount] = useState<number>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add Client Modal State
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    phone: "",
    email: "",
    clientTypeId: "",
    clientNotes: "",
  });
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);
  const [clientFormError, setClientFormError] = useState<string | null>(null);
  const [clientFormSuccess, setClientFormSuccess] = useState(false);
  const [existingClientData, setExistingClientData] = useState<ClientData | null>(null);

  /** Site client types for dropdown (from settings). */
  const [clientTypes, setClientTypes] = useState<ClientTypeEntry[]>(() => DEFAULT_CLIENT_TYPE_ENTRIES);

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

    const clientsRef = collection(db, "sites", siteId, "clients");
    const clientsQuery = query(clientsRef);

    const unsubscribe = onSnapshot(
      clientsQuery,
      (snapshot) => {
        // REPLACE state entirely from this snapshot (no append, no merge with bookings or previous state)
        const mapped = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          if (data.archived === true) return null;
          const phone = (data.phone || docSnap.id || "").replace(/\s|-|\(|\)/g, "") || docSnap.id;
          const clientTypeRaw = (data.clientType != null && typeof data.clientType === "string") ? data.clientType.trim() : "";
          const typeId = (data.clientTypeId != null && typeof data.clientTypeId === "string") ? data.clientTypeId.trim() : undefined;
          return {
            id: docSnap.id,
            name: data.name || "",
            phone,
            email: data.email || undefined,
            notes: data.notes || undefined,
            clientType: clientTypeRaw || "רגיל",
            clientTypeId: typeId || REGULAR_CLIENT_TYPE_ID,
            clientNotes: data.clientNotes != null ? String(data.clientNotes).trim() || undefined : undefined,
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

  // Subscribe to client types (sites/{siteId}/settings/clients only)
  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeClientTypes(siteId, (list) => setClientTypes(list));
    return () => unsub();
  }, [siteId]);

  const getTypeLabel = useCallback((client: Client): string => {
    const id = client.clientTypeId || REGULAR_CLIENT_TYPE_ID;
    const entry = clientTypes.find((t) => t.id === id);
    return entry ? entry.labelHe : "רגיל";
  }, [clientTypes]);

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
              durationMin: typeof data.durationMin === "number" ? data.durationMin : undefined,
              status: data.status || "confirmed",
              createdAt: data.createdAt,
              note: data.note || undefined,
              price: data.price || undefined,
              isArchived: data.isArchived === true,
              archivedAt: data.archivedAt,
              archivedReason: data.archivedReason ?? undefined,
              whatsappStatus: data.whatsappStatus ?? undefined,
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

  // Last confirmed past appointment (derived from client bookings)
  const lastAppointment = useMemo(() => {
    if (!selectedClientId || clientBookings.length === 0) return { lastConfirmedAt: null as Date | null, daysSince: null as number | null };
    return getLastConfirmedPastAppointment(
      clientBookings.map((b) => ({
        date: b.date,
        time: b.time,
        durationMin: b.durationMin,
        status: b.status,
        whatsappStatus: b.whatsappStatus,
        isArchived: b.isArchived,
        archivedAt: b.archivedAt,
      })),
      new Date()
    );
  }, [selectedClientId, clientBookings]);

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
    const defaultId = clientTypes.some((t) => t.id === REGULAR_CLIENT_TYPE_ID) ? REGULAR_CLIENT_TYPE_ID : (clientTypes[0]?.id ?? REGULAR_CLIENT_TYPE_ID);
    setNewClientForm({ name: "", phone: "", email: "", clientTypeId: defaultId, clientNotes: "" });
    setClientFormError(null);
    setClientFormSuccess(false);
    setExistingClientData(null);
  };

  const handleCloseAddClientModal = () => {
    setIsAddClientModalOpen(false);
    setNewClientForm({ name: "", phone: "", email: "", clientTypeId: "", clientNotes: "" });
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

      const typeIdToSave = clientTypes.some((t) => t.id === newClientForm.clientTypeId) ? newClientForm.clientTypeId : REGULAR_CLIENT_TYPE_ID;
      await createClient(siteId, {
        name: newClientForm.name.trim(),
        phone: normalizedPhone,
        email: newClientForm.email.trim() || undefined,
        clientTypeId: typeIdToSave,
        clientNotes: newClientForm.clientNotes.trim() || undefined,
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

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message: string, error?: boolean) => {
    setToast({ message, error });
  }, []);

  const closeActionsMenu = useCallback(() => {
    setActionsOpenForId(null);
    setActionsMenuClient(null);
    setActionsMenuRect(null);
  }, []);

  useEffect(() => {
    if (!actionsOpenForId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActionsMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionsOpenForId, closeActionsMenu]);

  const openEditModal = useCallback((client: Client) => {
    closeActionsMenu();
    setEditClient(client);
    const resolvedId = client.clientTypeId || REGULAR_CLIENT_TYPE_ID;
    setEditForm({
      name: client.name,
      email: client.email ?? "",
      clientTypeId: clientTypes.some((t) => t.id === resolvedId) ? resolvedId : REGULAR_CLIENT_TYPE_ID,
      clientNotes: client.clientNotes ?? "",
    });
    setEditError(null);
  }, [closeActionsMenu, clientTypes]);

  const closeEditModal = useCallback(() => {
    setEditClient(null);
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!firebaseUser || !siteId || !editClient) return;
    if (!editForm.name.trim()) {
      setEditError("שם הוא שדה חובה");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const typeIdToSave = clientTypes.some((t) => t.id === editForm.clientTypeId) ? editForm.clientTypeId : REGULAR_CLIENT_TYPE_ID;
      const res = await fetch("/api/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          siteId,
          clientId: editClient.id,
          updates: {
            name: editForm.name.trim(),
            email: editForm.email.trim() || undefined,
            clientTypeId: typeIdToSave,
            clientNotes: editForm.clientNotes.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }
      closeEditModal();
      showToast("הלקוח עודכן בהצלחה");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה בעדכון";
      setEditError(msg);
      showToast(msg, true);
    } finally {
      setEditSaving(false);
    }
  }, [firebaseUser, siteId, editClient, editForm, clientTypes, closeEditModal, showToast]);

  const openDeleteModal = useCallback(async (client: Client) => {
    closeActionsMenu();
    setDeleteClient(client);
    setDeleteMode("client_only");
    setDeleteConfirmText("");
    setDeleteError(null);
    if (selectedClientId === client.id) {
      setDeleteBookingCount(clientBookings.length);
    } else {
      setDeleteBookingCount(0);
      try {
        const token = firebaseUser ? await firebaseUser.getIdToken() : null;
        if (!token || !siteId) {
          setDeleteBookingCount(0);
          return;
        }
        const res = await fetch(
          `/api/clients/booking-count?siteId=${encodeURIComponent(siteId)}&clientId=${encodeURIComponent(client.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        setDeleteBookingCount(data.ok ? data.count ?? 0 : 0);
      } catch {
        setDeleteBookingCount(0);
      }
    }
  }, [selectedClientId, clientBookings.length, firebaseUser, siteId, closeActionsMenu]);

  const closeDeleteModal = useCallback(() => {
    setDeleteClient(null);
    setDeleteConfirmText("");
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!firebaseUser || !siteId || !deleteClient) return;
    const expectedConfirm = "מחק";
    const validConfirm = deleteConfirmText.trim() === expectedConfirm || deleteConfirmText.trim() === deleteClient.id;
    if (!validConfirm) {
      setDeleteError(`הקלד "${expectedConfirm}" או את מספר הטלפון ${deleteClient.id} לאישור`);
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/clients/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, clientId: deleteClient.id, mode: deleteMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }
      closeDeleteModal();
      if (selectedClientId === deleteClient.id) {
        setSelectedClientId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("clientId");
        router.replace(url.pathname + url.search);
      }
      showToast("הלקוח נמחק");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה במחיקה";
      setDeleteError(msg);
      showToast(msg, true);
    } finally {
      setDeleteLoading(false);
    }
  }, [firebaseUser, siteId, deleteClient, deleteMode, deleteConfirmText, selectedClientId, closeDeleteModal, router, showToast]);

  const toggleSelectForDelete = useCallback((clientId: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  const selectAllForDelete = useCallback(() => {
    setSelectedForDelete(new Set(filteredClients.map((c) => c.id)));
  }, [filteredClients]);

  const clearSelection = useCallback(() => {
    setSelectedForDelete(new Set());
  }, []);

  const BULK_DELETE_TIMEOUT_MS = 15000;

  const handleBulkDelete = useCallback(async () => {
    if (!firebaseUser || !siteId) return;
    const ids = Array.from(selectedForDelete);
    if (ids.length === 0) return;
    if (bulkDeleteConfirm.trim() !== "מחק") {
      setBulkDeleteError('הקלד "מחק" לאישור');
      return;
    }
    setBulkDeleteLoading(true);
    setBulkDeleteError(null);
    const wasSelectedInDetail = selectedClientId !== null && selectedForDelete.has(selectedClientId);
    try {
      const token = await firebaseUser.getIdToken();
      const fetchPromise = fetch("/api/clients/delete-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, clientIds: ids, mode: bulkDeleteMode }),
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("המחיקה לוקחת יותר מדי זמן (15 שניות). נסה שוב.")), BULK_DELETE_TIMEOUT_MS)
      );
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || res.statusText);
      }
      const deleted = (data as { deleted?: number }).deleted ?? 0;
      const failed = (data as { failed?: number }).failed ?? 0;
      if (failed > 0) {
        showToast(`נמחקו ${deleted}. ${failed} נכשלו (יש תורים?)`, true);
      } else {
        showToast(`נמחקו ${deleted} לקוחות`);
      }
      if (wasSelectedInDetail) {
        setSelectedClientId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("clientId");
        router.replace(url.pathname + url.search);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה במחיקה";
      setBulkDeleteError(msg);
      showToast(msg, true);
    } finally {
      setBulkDeleteLoading(false);
      setBulkDeleteOpen(false);
      setBulkDeleteConfirm("");
      setSelectedForDelete(new Set());
    }
  }, [firebaseUser, siteId, selectedForDelete, bulkDeleteMode, bulkDeleteConfirm, selectedClientId, router, showToast]);

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
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-slate-900">רשימת לקוחות</h2>
                <div className="flex gap-2">
                  {selectedForDelete.size > 0 && (
                    <>
                      <button
                        onClick={selectAllForDelete}
                        className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        בחר הכל
                      </button>
                      <button
                        onClick={clearSelection}
                        className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        נקה
                      </button>
                      <button
                        onClick={() => { setBulkDeleteOpen(true); setBulkDeleteMode("client_only"); setBulkDeleteConfirm(""); setBulkDeleteError(null); }}
                        className="px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 border border-red-200 rounded-lg font-medium"
                      >
                        מחק {selectedForDelete.size} נבחרים
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleOpenAddClientModal}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    הוסף/י לקוח
                  </button>
                </div>
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
                    <div
                      key={client.id}
                      className={`relative w-full text-right p-3 rounded-lg border transition-colors ${
                        selectedClientId === client.id
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelectForDelete(client.id); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-200 text-slate-500"
                        aria-label={selectedForDelete.has(client.id) ? "בטל בחירה" : "בחר למחיקה"}
                      >
                        {selectedForDelete.has(client.id) ? (
                          <CheckSquare className="w-5 h-5 text-sky-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClientSelect(client.id)}
                        className="w-full text-right block pr-10"
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
                      <div className="absolute left-2 top-1/2 -translate-y-1/2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (actionsOpenForId === client.id) {
                              closeActionsMenu();
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActionsMenuRect({
                                top: rect.bottom + 4,
                                right: typeof window !== "undefined" ? window.innerWidth - rect.left : 0,
                              });
                              setActionsMenuClient(client);
                              setActionsOpenForId(client.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-slate-200 text-slate-500"
                          aria-label="פעולות"
                          aria-expanded={actionsOpenForId === client.id}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
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
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">סוג לקוח</label>
                      <p className="text-base text-slate-900">
                        <span className="inline-block px-2 py-0.5 rounded text-sm font-medium bg-slate-100 text-slate-800">
                          {clientTypes.some((t) => t.id === (selectedClient.clientTypeId || REGULAR_CLIENT_TYPE_ID)) ? getTypeLabel(selectedClient) : "רגיל"}
                        </span>
                      </p>
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
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">תור אחרון</label>
                      <p className="text-base text-slate-900">
                        {lastAppointment.lastConfirmedAt
                          ? lastAppointment.lastConfirmedAt.toLocaleDateString("he-IL", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : clientBookings.length > 0
                            ? "אין תור עבר מאושר"
                            : "—"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">ימים מאז תור אחרון</label>
                      <p className="text-base text-slate-900">
                        {lastAppointment.daysSince !== null
                          ? String(lastAppointment.daysSince)
                          : lastAppointment.lastConfirmedAt == null
                            ? "—"
                            : "0"}
                      </p>
                    </div>
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
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">הערות לקוח</label>
                    <p className="text-base text-slate-900 whitespace-pre-wrap">
                      {selectedClient.clientNotes?.trim() ? selectedClient.clientNotes.trim() : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedClient)}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg"
                  >
                    <Pencil className="w-4 h-4" />
                    ערוך לקוח
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteModal(selectedClient)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                    מחק לקוח
                  </button>
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
                              {booking.isArchived ? (
                                /* Archived (deleted) booking: show only date, service, service type, worker */
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm items-center">
                                  <div>
                                    <span className="text-slate-600">תאריך:</span>{" "}
                                    <span className="font-medium">
                                      {new Date(booking.date + "T00:00:00").toLocaleDateString("he-IL")}
                                    </span>
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
                                  <div className="md:col-span-4 flex items-center gap-2">
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                      {booking.whatsappStatus === "cancelled" || booking.status === "cancelled"
                                        ? "בוטל"
                                        : "הוסר מיומן"}
                                      {booking.archivedAt != null &&
                                        ` (${typeof (booking.archivedAt as { toDate?: () => Date }).toDate === "function"
                                          ? new Date((booking.archivedAt as { toDate: () => Date }).toDate()).toLocaleDateString("he-IL")
                                          : new Date(booking.archivedAt as string).toLocaleDateString("he-IL")})`}
                                    </span>
                                  </div>
                                </div>
                              ) : (
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
                                        getDisplayStatus(booking, clientBookings).color === "green"
                                          ? "text-emerald-600"
                                          : getDisplayStatus(booking, clientBookings).color === "red"
                                            ? "text-red-600"
                                            : "text-amber-600"
                                      }`}
                                    >
                                      {getDisplayStatus(booking, clientBookings).label}
                                    </span>
                                  </div>
                                </div>
                              )}
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
                  <label htmlFor="clientType" className="block text-sm font-medium text-slate-700 mb-1">
                    סוג לקוח
                  </label>
                  <select
                    id="clientType"
                    name="clientTypeId"
                    value={newClientForm.clientTypeId || REGULAR_CLIENT_TYPE_ID}
                    onChange={(e) => setNewClientForm((p) => ({ ...p, clientTypeId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                  >
                    {clientTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.labelHe}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="clientNotes" className="block text-sm font-medium text-slate-700 mb-1">
                    הערות לקוח
                  </label>
                  <textarea
                    id="clientNotes"
                    name="clientNotes"
                    value={newClientForm.clientNotes}
                    onChange={handleClientFormChange}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm resize-none"
                    placeholder="הערות פנימיות (אופציונלי)"
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

      {/* Actions menu portal (floats above all content) */}
      {actionsOpenForId && actionsMenuClient && actionsMenuRect &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              aria-hidden
              onClick={closeActionsMenu}
            />
            <div
              className="fixed z-[9999] py-1 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[140px]"
              style={{
                top: actionsMenuRect.top,
                right: actionsMenuRect.right,
              }}
              dir="rtl"
            >
              <button
                type="button"
                onClick={() => openEditModal(actionsMenuClient)}
                className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="w-4 h-4" />
                עריכה
              </button>
              <button
                type="button"
                onClick={() => openDeleteModal(actionsMenuClient)}
                className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                מחיקה
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.error ? "bg-red-600 text-white" : "bg-slate-800 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Edit Client Modal */}
      {editClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">עריכת לקוח</h2>
              {editError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם מלא *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">טלפון</label>
                  <input
                    type="text"
                    value={editClient.phone}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-slate-600"
                  />
                  <p className="text-xs text-slate-500 mt-1">לא ניתן לשנות טלפון (מזהה הלקוח).</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">סוג לקוח</label>
                  <select
                    value={editForm.clientTypeId || REGULAR_CLIENT_TYPE_ID}
                    onChange={(e) => setEditForm((p) => ({ ...p, clientTypeId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                  >
                    {clientTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.labelHe}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">הערות לקוח</label>
                  <textarea
                    value={editForm.clientNotes}
                    onChange={(e) => setEditForm((p) => ({ ...p, clientNotes: e.target.value }))}
                    rows={3}
                    placeholder="הערות פנימיות על הלקוח (אופציונלי)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
                >
                  {editSaving ? "שומר…" : "שמור"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Modal */}
      {deleteClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-2">למחוק לקוח?</h2>
              <p className="text-sm text-slate-600 mb-4">
                הפעולה תמחק את הלקוח. מה לעשות עם התורים שלו?
              </p>
              <p className="text-sm text-slate-700 mb-4">
                ללקוח זה יש <strong>{deleteBookingCount}</strong> תורים.
              </p>
              <div className="space-y-2 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === "client_only"}
                    onChange={() => setDeleteMode("client_only")}
                    className="rounded-full"
                  />
                  <span className="text-sm">מחק רק את הלקוח והשאר תורים</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === "client_and_bookings"}
                    onChange={() => setDeleteMode("client_and_bookings")}
                    className="rounded-full"
                  />
                  <span className="text-sm">מחק לקוח + מחק את כל התורים שלו</span>
                </label>
              </div>
              {deleteMode === "client_only" && deleteBookingCount > 0 && (
                <p className="text-xs text-amber-700 mb-2">
                  לא ניתן למחוק רק את הלקוח כאשר יש תורים. בחר למחוק גם תורים.
                </p>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  הקלד &quot;מחק&quot; או את מספר הטלפון לאישור
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="מחק או 0541234567"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                />
              </div>
              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                  <p className="text-sm text-red-700">{deleteError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={
                    deleteLoading ||
                    (deleteMode === "client_only" && deleteBookingCount > 0) ||
                    (deleteConfirmText.trim() !== "מחק" && deleteConfirmText.trim() !== deleteClient.id)
                  }
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? "מוחק…" : "מחק"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-2">מחיקת {selectedForDelete.size} לקוחות</h2>
              <p className="text-sm text-slate-600 mb-4">
                מה לעשות עם התורים של הלקוחות הנבחרים?
              </p>
              <div className="space-y-2 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkDeleteMode"
                    checked={bulkDeleteMode === "client_only"}
                    onChange={() => setBulkDeleteMode("client_only")}
                    className="rounded-full"
                  />
                  <span className="text-sm">מחק רק את הלקוחות (השאר תורים)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkDeleteMode"
                    checked={bulkDeleteMode === "client_and_bookings"}
                    onChange={() => setBulkDeleteMode("client_and_bookings")}
                    className="rounded-full"
                  />
                  <span className="text-sm">מחק לקוחות + מחק את כל התורים שלהם</span>
                </label>
              </div>
              <p className="text-xs text-amber-700 mb-2">
                לקוחות עם תורים יידלגו אם תבחר &quot;מחק רק לקוחות&quot;.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  הקלד &quot;מחק&quot; לאישור
                </label>
                <input
                  type="text"
                  value={bulkDeleteConfirm}
                  onChange={(e) => setBulkDeleteConfirm(e.target.value)}
                  placeholder="מחק"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                />
              </div>
              {bulkDeleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                  <p className="text-sm text-red-700">{bulkDeleteError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setBulkDeleteOpen(false); setBulkDeleteConfirm(""); setBulkDeleteError(null); }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteLoading || bulkDeleteConfirm.trim() !== "מחק"}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDeleteLoading ? "מוחק…" : "מחק"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
