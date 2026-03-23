"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { query, where, orderBy, getDocs, collection, limit } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import { bookingsCollection, clientArchivedServiceTypesCollection } from "@/lib/firestorePaths";
import { ChemicalCard } from "./ChemicalCard";
import PersonalPricingTab from "./PersonalPricingTab";
import AdminTabs from "@/components/ui/AdminTabs";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import { createClient, checkClientExists, type ClientData } from "@/lib/firestoreClients";
import { subscribeClientStatusSettings } from "@/lib/firestoreClientSettings";
import type { AutomatedClientStatus, ManualClientTag } from "@/types/clientStatus";
import { CLIENT_STATUS_LABELS_HE } from "@/types/clientStatus";
import { automatedStatusBadgeClass } from "@/lib/clientStatusBadgeStyles";
import { getLastQualifyingBooking } from "@/lib/lastConfirmedAppointment";
import { getDisplayStatus } from "@/lib/bookingRootStatus";
import { useAuth } from "@/components/auth/AuthProvider";
import { triggerClientStatusRecomputeOncePerSession } from "@/lib/triggerClientStatusRecompute";
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
  manualTagIds?: string[];
  currentStatus?: AutomatedClientStatus;
  lastVisit?: string; // ISO date string
  createdAt?: string; // ISO date string
}

/** Status values for client booking history display (from live status or statusAtArchive). */
type HistoryBookingStatus = "booked" | "pending" | "confirmed" | "canceled" | "cancelled";

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  serviceType?: string | null;
  serviceTypeId?: string | null;
  workerName?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMin?: number;
  /** Live or stored status from Firestore */
  status: string;
  /** Explicit display value: statusAtArchive ?? status ?? "booked" (one source of truth per item) */
  displayedStatus: string;
  createdAt?: unknown;
  note?: string;
  price?: number;
  isArchived?: boolean;
  archivedAt?: unknown;
  archivedReason?: string;
  statusAtArchive?: string;
  whatsappStatus?: string;
  /** Dev only: which collection this item was read from (for debug after dev-reset). */
  _source?: "bookings" | "archivedServiceTypes";
  /** Dev only: full Firestore path (for debug). */
  _path?: string;
}

/** Coerce to string when value is a non-empty string; otherwise undefined. */
function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = typeof v === "string" ? v : String(v);
  const t = s.trim();
  return t !== "" ? t : undefined;
}

/** Hebrew label for booking history status (archived and live). */
function historyStatusLabel(status: string | undefined): string {
  const s = (status ?? "booked").trim().toLowerCase();
  if (s === "unknown" || s === "") return "לא ידוע";
  if (s === "confirmed" || s === "אושר") return "מאושר";
  if (s === "pending" || s === "awaiting_confirmation") return "ממתין לאישור";
  if (s === "cancelled" || s === "canceled") return "בוטל";
  return "נקבע";
}

export default function ClientCardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (!siteId || !firebaseUser) return;
    void triggerClientStatusRecomputeOncePerSession(siteId, () => firebaseUser.getIdToken());
  }, [siteId, firebaseUser]);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientBookings, setClientBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AutomatedClientStatus>("all");

  // Tab state for client details sections
  type TabType = "chemistry" | "bookings" | "pricing";
  const [activeTab, setActiveTab] = useState<TabType>("chemistry");

  // Actions menu (list row) - uses portal for correct layering
  const [actionsOpenForId, setActionsOpenForId] = useState<string | null>(null);
  const [actionsMenuClient, setActionsMenuClient] = useState<Client | null>(null);
  const [actionsMenuRect, setActionsMenuRect] = useState<{ top: number; right: number } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  /** When loading archived from archivedServiceTypes fails (e.g. permission), show notice without blocking. */
  const [archivedLoadError, setArchivedLoadError] = useState<string | null>(null);

  // Edit modal
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", clientNotes: "", manualTagIds: [] as string[] });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Selection for bulk delete
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  // Bulk delete modal
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Delete modal
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add Client Modal State
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    phone: "",
    email: "",
    clientNotes: "",
    manualTagIds: [] as string[],
  });
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);
  const [clientFormError, setClientFormError] = useState<string | null>(null);
  const [clientFormSuccess, setClientFormSuccess] = useState(false);
  const [existingClientData, setExistingClientData] = useState<ClientData | null>(null);

  const [manualTags, setManualTags] = useState<ManualClientTag[]>([]);

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
    const clientsQuery = query(clientsRef, limit(500));

    const unsubscribe = onSnapshotDebug(
      "client-card-clients",
      clientsQuery,
      (snapshot) => {
        // REPLACE state entirely from this snapshot (no append, no merge with bookings or previous state)
        const mapped = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          if (data.archived === true) return null;
          const phone = String(data.phone ?? docSnap.id ?? "").replace(/\s|-|\(|\)/g, "") || docSnap.id;
          const clientTypeRaw = (data.clientType != null && typeof data.clientType === "string") ? data.clientType.trim() : "";
          const typeId = (data.clientTypeId != null && typeof data.clientTypeId === "string") ? data.clientTypeId.trim() : undefined;
          return {
            id: docSnap.id,
            name: (data.name as string) || "",
            phone,
            email: data.email || undefined,
            notes: data.notes || undefined,
            clientType: clientTypeRaw || "רגיל",
            clientTypeId: typeId || "regular",
            clientNotes: data.clientNotes != null ? String(data.clientNotes).trim() || undefined : (data.notes != null ? String(data.notes).trim() || undefined : undefined),
            manualTagIds: Array.isArray(data.manualTagIds) ? (data.manualTagIds as unknown[]).filter((t) => typeof t === "string").map((t) => String(t)) : [],
            currentStatus: typeof data.currentStatus === "string" ? (data.currentStatus as AutomatedClientStatus) : "normal",
            lastVisit: undefined,
            createdAt: (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === "string" ? data.createdAt : undefined),
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

  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeClientStatusSettings(siteId, (settings) => {
      setManualTags(settings.manualTags);
    });
    return () => unsub();
  }, [siteId]);

  // Load bookings for selected client (one-time getDocs; no realtime listener to reduce reads)
  useEffect(() => {
    if (!db || !siteId || !selectedClientId) {
      setClientBookings([]);
      setBookingsLoading(false);
      setBookingsError(null);
      return;
    }
    const clientId = selectedClientId;

    // Clear stale list immediately when clientId changes so we don't show previous client's data
    setClientBookings([]);
    let cancelled = false;
    setBookingsLoading(true);
    setBookingsError(null);
    setArchivedLoadError(null);

    async function fetchClientBookings() {
      let bookingsQuery;
      try {
        bookingsQuery = query(
          bookingsCollection(siteId),
          where("customerPhone", "==", clientId),
          orderBy("date", "desc"),
          limit(100)
        );
      } catch {
        try {
          bookingsQuery = query(
            bookingsCollection(siteId),
            where("customerPhone", "==", clientId),
            limit(100)
          );
        } catch {
          bookingsQuery = query(bookingsCollection(siteId), limit(200));
        }
      }

      try {
        const snapshot = await getDocs(bookingsQuery);
        if (cancelled) return;
        const rawItems = snapshot.docs
          .filter((doc) => (doc.data() as Record<string, unknown>).customerPhone === clientId)
          .map((doc): Booking => {
            const data = doc.data() as Record<string, unknown>;
            const id = doc.id;
            const rawStatusAtArchive = data["statusAtArchive"] ?? data.statusAtArchive;
            const rawStatus = data["status"] ?? data.status;
            const statusAtArchiveStr =
              rawStatusAtArchive != null && String(rawStatusAtArchive).trim() !== ""
                ? String(rawStatusAtArchive).trim()
                : undefined;
            const statusStr =
              rawStatus != null && String(rawStatus).trim() !== "" ? String(rawStatus).trim() : undefined;
            const displayedStatus = statusAtArchiveStr ?? statusStr ?? "unknown";
            return {
              id,
              customerName: (data.customerName as string) || "",
              customerPhone: (data.customerPhone as string) || "",
              serviceName: (data.serviceName as string) || "",
              serviceType: (data.serviceType as string) ?? null,
              serviceTypeId: (data.serviceTypeId as string) ?? null,
              workerName: (data.workerName as string) ?? null,
              date: (data.date as string) || (data.dateISO as string) || "",
              time: (data.time as string) || (data.timeHHmm as string) || "",
              durationMin: typeof data.durationMin === "number" ? data.durationMin : undefined,
              status: statusStr ?? "unknown",
              displayedStatus,
              createdAt: data.createdAt,
              note: (data.note as string) ?? undefined,
              price: typeof data.price === "number" ? data.price : undefined,
              isArchived: data.isArchived === true,
              archivedAt: data.archivedAt,
              archivedReason: (data.archivedReason as string) ?? undefined,
              statusAtArchive: statusAtArchiveStr,
              whatsappStatus: (data.whatsappStatus as string) ?? undefined,
              _source: "bookings" as const,
              _path: `sites/${siteId}/bookings/${id}`,
            };
          });
        const active = rawItems.filter((b) => !b.isArchived);

        let archivedFromNewPath: Booking[] = [];
        try {
          const archivedRef = clientArchivedServiceTypesCollection(siteId, clientId);
          const archivedSnap = await getDocs(archivedRef);
          if (cancelled) return;
          archivedFromNewPath = archivedSnap.docs.map((doc): Booking => {
            const data = doc.data() as Record<string, unknown>;
            const rawStatusAtArchive = data["statusAtArchive"] ?? data.statusAtArchive;
            const statusAtArchiveStr =
              rawStatusAtArchive != null && String(rawStatusAtArchive).trim() !== ""
                ? String(rawStatusAtArchive).trim()
                : undefined;
            return {
              id: doc.id,
              customerName: (data.customerName as string) || "",
              customerPhone: (data.customerPhone as string) || "",
              serviceName: (data.serviceName as string) || "",
              serviceType: (data.serviceType as string) ?? null,
              serviceTypeId: (data.serviceTypeId as string) ?? doc.id,
              workerName: (data.workerName as string) ?? null,
              date: (data.date as string) || (data.dateISO as string) || "",
              time: (data.time as string) || (data.timeHHmm as string) || "",
              durationMin: typeof data.durationMin === "number" ? data.durationMin : undefined,
              status: statusAtArchiveStr ?? "unknown",
              displayedStatus: statusAtArchiveStr ?? asString(data.status) ?? asString(data["status"]) ?? "unknown",
              createdAt: data.createdAt,
              note: (data.note as string) ?? undefined,
              price: typeof data.price === "number" ? data.price : undefined,
              isArchived: true,
              archivedAt: data.archivedAt,
              archivedReason: (data.archivedReason as string) ?? undefined,
              statusAtArchive: statusAtArchiveStr,
              whatsappStatus: (data.whatsappStatus as string) ?? undefined,
              _source: "archivedServiceTypes" as const,
              _path: `sites/${siteId}/clients/${clientId}/archivedServiceTypes/${doc.id}`,
            };
          });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          const isPermission = err?.code === "permission-denied" || err?.message?.includes("permission");
          if (!cancelled) {
            setArchivedLoadError(
              isPermission
                ? "הרשאות: לא ניתן לטעון תורים שהוסרו. עדכן כללי אבטחה ב-Firestore."
                : null
            );
          }
          console.warn("[ClientCard] Failed to load archived from archivedServiceTypes", e);
        }

        const bookings = [...active, ...archivedFromNewPath].sort((a, b) => {
          const dateCompare = (b.date || "").localeCompare(a.date || "");
          if (dateCompare !== 0) return dateCompare;
          return (b.time || "").localeCompare(a.time || "");
        });
        if (!cancelled) {
          if (process.env.NODE_ENV !== "production") {
            const fromBookings = bookings.filter((b) => b._source === "bookings").length;
            const fromArchived = bookings.filter((b) => b._source === "archivedServiceTypes").length;
            console.log("[ClientCard] History loaded", {
              clientId,
              total: bookings.length,
              fromBookings,
              fromArchived,
              paths: {
                bookings: `sites/${siteId}/bookings (customerPhone==${clientId})`,
                archivedServiceTypes: `sites/${siteId}/clients/${clientId}/archivedServiceTypes`,
              },
            });
          }
          setClientBookings(bookings);
          setBookingsLoading(false);
          setBookingsError(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[ClientCard] Failed to load bookings", err);
        const msg = (err as { message?: string })?.message ?? "";
        if (msg.includes("index") || (err as { code?: string }).code === "failed-precondition") {
          setBookingsError("נדרש אינדקס ב-Firestore. אנא צור אינדקס עבור customerPhone + date.");
        } else {
          setBookingsError("שגיאה בטעינת התורים");
        }
        setBookingsLoading(false);
        setClientBookings([]);
      }
    }

    fetchClientBookings();
    return () => {
      cancelled = true;
    };
  }, [siteId, selectedClientId]);

  // Derive selected client from ID and clients list (useMemo prevents loops)
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  // Last qualifying booking (most recent non-cancelled, past or future; excludes only cancelled)
  const lastBooking = useMemo(() => {
    if (!selectedClientId || clientBookings.length === 0) return { lastBookingAt: null as Date | null, daysSince: null as number | null };
    return getLastQualifyingBooking(
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
    const query = searchQuery.toLowerCase();
    return clients.filter((client) => {
      const matchesSearch =
        !query.trim() ||
        client.name.toLowerCase().includes(query) ||
        client.phone.includes(query);
      const clientStatus = client.currentStatus || "normal";
      const matchesStatus = statusFilter === "all" ? true : clientStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, searchQuery, statusFilter]);


  // Build tabs array with proper typing - "chemistry" is first (default)
  const clientTabs = useMemo<Array<{ key: TabType; label: string }>>(() => {
    return [
      { key: "chemistry" as TabType, label: "כימיה" },
      { key: "bookings" as TabType, label: "היסטוריית תורים" },
      { key: "pricing" as TabType, label: "תמחור אישי" },
    ];
  }, []);

  const clientCardRef = useRef<HTMLDivElement>(null);

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    // Update URL without page reload
    const url = new URL(window.location.href);
    url.searchParams.set("clientId", clientId);
    window.history.pushState({}, "", url.toString());
  };

  // On mobile, scroll to client card when a client is selected
  useEffect(() => {
    if (!selectedClientId || typeof window === "undefined") return;
    const isMobile = window.innerWidth < 1024; // lg breakpoint
    if (!isMobile) return;
    const el = clientCardRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedClientId]);

  // Handle Add Client Modal
  const handleOpenAddClientModal = () => {
    setIsAddClientModalOpen(true);
    setNewClientForm({ name: "", phone: "", email: "", clientNotes: "", manualTagIds: [] });
    setClientFormError(null);
    setClientFormSuccess(false);
    setExistingClientData(null);
  };

  const handleCloseAddClientModal = () => {
    setIsAddClientModalOpen(false);
    setNewClientForm({ name: "", phone: "", email: "", clientNotes: "", manualTagIds: [] });
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

      await createClient(siteId, {
        name: newClientForm.name.trim(),
        phone: normalizedPhone,
        email: newClientForm.email.trim() || undefined,
        clientNotes: newClientForm.clientNotes.trim() || undefined,
        manualTagIds: newClientForm.manualTagIds,
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
    setEditForm({
      name: client.name,
      email: client.email ?? "",
      clientNotes: client.clientNotes ?? client.notes ?? "",
      manualTagIds: client.manualTagIds ?? [],
    });
    setEditError(null);
  }, [closeActionsMenu]);

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
      const res = await fetch("/api/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          siteId,
          clientId: editClient.id,
          updates: {
            name: editForm.name.trim(),
            email: editForm.email.trim() || undefined,
            clientNotes: editForm.clientNotes.trim() || undefined,
            manualTagIds: editForm.manualTagIds,
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
  }, [firebaseUser, siteId, editClient, editForm, closeEditModal, showToast]);

  const openDeleteModal = useCallback((client: Client) => {
    closeActionsMenu();
    setDeleteClient(client);
    setDeleteConfirmText("");
    setDeleteError(null);
  }, [closeActionsMenu]);

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
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(deleteClient.id)}/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
  }, [firebaseUser, siteId, deleteClient, deleteConfirmText, selectedClientId, closeDeleteModal, router, showToast]);

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
        body: JSON.stringify({ siteId, clientIds: ids }),
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
        showToast(`נמחקו ${deleted}. ${failed} נכשלו.`, true);
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
  }, [firebaseUser, siteId, selectedForDelete, bulkDeleteConfirm, selectedClientId, router, showToast]);

  return (
    <div dir="rtl" className="min-h-screen w-full">
      <div className="w-full max-w-7xl mx-auto min-w-0">
        <div className="mb-6">
          <AdminPageHero
            title="כרטיס לקוח"
            subtitle="ניהול לקוחות והיסטוריית תורים"
          />
        </div>

        {clientsError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-right">
            <p className="text-sm text-red-700">{clientsError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full min-w-0">
          {/* Clients List */}
          <div className="lg:col-span-1 min-w-0">
            <AdminCard className="p-3 md:p-4">
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
                        onClick={() => { setBulkDeleteOpen(true); setBulkDeleteConfirm(""); setBulkDeleteError(null); }}
                        className="px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 border border-red-200 rounded-lg font-medium"
                      >
                        מחק {selectedForDelete.size} נבחרים
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleOpenAddClientModal}
                    className="px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    הוסף/י לקוח
                  </button>
                </div>
              </div>
              
              {/* Search Input */}
              <div className="mb-4 grid grid-cols-1 gap-2">
                <input
                  type="text"
                  placeholder="חפש לפי שם או טלפון..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep text-sm"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter((e.target.value as "all" | AutomatedClientStatus))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep text-sm"
                >
                  <option value="all">כל סוגי הלקוחות</option>
                  <option value="new">חדש</option>
                  <option value="active">פעיל</option>
                  <option value="normal">רגיל</option>
                  <option value="sleeping">רדום</option>
                </select>
              </div>

              {clientsLoading ? (
                <p className="text-sm text-slate-500 text-center py-8">טוען לקוחות…</p>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500 mb-2">
                    {(searchQuery || statusFilter !== "all") ? "לא נמצאו לקוחות התואמים לסינון" : "אין לקוחות רשומים"}
                  </p>
                  {!searchQuery && statusFilter === "all" && (
                    <p className="text-xs text-slate-400">
                      לקוחות יופיעו כאן לאחר יצירת תורים
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1 md:space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      role="presentation"
                      onClick={() => handleClientSelect(client.id)}
                      className={`relative w-full cursor-pointer text-right rounded-lg border transition-colors flex items-center gap-2 md:block md:py-3 py-2.5 px-2.5 md:px-3 md:gap-0 ${
                        selectedClientId === client.id
                          ? "border-[#1E6F7C] bg-[rgba(30,111,124,0.08)]"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100"
                      }`}
                    >
                      {/* Drag / actions handle — start in RTL (⋮) */}
                      <div
                        className="relative z-10 flex-shrink-0 md:absolute md:left-2 md:top-1/2 md:-translate-y-1/2 order-1 md:order-none"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
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
                          className="p-1.5 md:p-1 rounded touch-manipulation hover:bg-slate-200 text-slate-500"
                          aria-label="פעולות"
                          aria-expanded={actionsOpenForId === client.id}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </div>
                      {/* Main area: Name + Phone + status (row click opens card) */}
                      <div className="flex-1 min-w-0 text-right block py-0.5 pr-1 md:pr-10 md:py-0 order-2 touch-manipulation">
                        <h3 className="font-bold text-slate-900 text-base md:font-semibold md:text-[inherit] truncate">{client.name || "—"}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 md:mt-1">{client.phone}</p>
                        <div
                          className="mt-1 flex w-full flex-row flex-wrap items-center justify-end gap-2"
                          dir="ltr"
                        >
                          {(client.manualTagIds ?? []).length > 0 && (
                            <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                              {(client.manualTagIds ?? []).slice(0, 3).map((id) => {
                                const tag = manualTags.find((t) => t.id === id);
                                return (
                                  <span
                                    key={`${client.id}-${id}`}
                                    className="inline-flex max-w-full shrink rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                                    dir="auto"
                                  >
                                    {tag?.label ?? id}
                                  </span>
                                );
                              })}
                              {(client.manualTagIds ?? []).length > 3 && (
                                <span className="inline-flex shrink-0 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                  +{(client.manualTagIds ?? []).length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          <span
                            className={`shrink-0 ${automatedStatusBadgeClass(client.currentStatus || "normal")} text-xs`}
                            dir="rtl"
                          >
                            {CLIENT_STATUS_LABELS_HE[client.currentStatus || "normal"]}
                          </span>
                        </div>
                      </div>
                      {/* Checkbox — right in RTL (✓) */}
                      <div
                        className="relative z-10 flex-shrink-0 md:absolute md:right-2 md:top-1/2 md:-translate-y-1/2 order-3 md:order-none"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelectForDelete(client.id); }}
                        className="p-1.5 md:p-1 rounded touch-manipulation hover:bg-slate-200 text-slate-500 w-full h-full flex items-center justify-center"
                        aria-label={selectedForDelete.has(client.id) ? "בטל בחירה" : "בחר למחיקה"}
                      >
                        {selectedForDelete.has(client.id) ? (
                          <CheckSquare className="w-5 h-5 text-caleno-deep" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          </div>

          {/* Client Details Card — ref for mobile scroll-into-view */}
          <div ref={clientCardRef} className="lg:col-span-2 min-w-0">
            {selectedClient ? (
              <AdminCard className="p-4 md:p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-1 md:text-xl md:mb-6">פרטי לקוח</h2>

                {/* Client Details — compact 2-line key/value on mobile */}
                <div className="border-b border-slate-200 pb-4 md:pb-6 mb-4 md:mb-6 space-y-3 md:space-y-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-4">
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">שם</p>
                      <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">{selectedClient.name || "—"}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">טלפון</p>
                      <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">{selectedClient.phone}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">סטטוס אוטומטי</p>
                      <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">
                        <span
                          className={`${automatedStatusBadgeClass(selectedClient.currentStatus || "normal")} text-sm`}
                        >
                          {CLIENT_STATUS_LABELS_HE[selectedClient.currentStatus || "normal"]}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-0.5 md:col-span-2">
                      <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">תגיות ידניות</p>
                      <div className="flex flex-wrap gap-2">
                        {(selectedClient.manualTagIds ?? []).length > 0
                          ? (selectedClient.manualTagIds ?? []).map((id) => {
                              const tag = manualTags.find((t) => t.id === id);
                              return (
                                <span key={id} className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700">
                                  {tag?.label ?? id}
                                </span>
                              );
                            })
                          : <span className="text-sm text-slate-500">ללא תגיות</span>}
                      </div>
                    </div>
                    {selectedClient.email && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">אימייל</p>
                        <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">{selectedClient.email}</p>
                      </div>
                    )}
                    {selectedClient.lastVisit && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">ביקור אחרון</p>
                        <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">
                          {new Date(selectedClient.lastVisit + "T00:00:00").toLocaleDateString("he-IL")}
                        </p>
                      </div>
                    )}
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">תור אחרון</p>
                      <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">
                        {lastBooking.lastBookingAt
                          ? lastBooking.lastBookingAt.toLocaleDateString("he-IL", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "אין תור קיים"}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">ימים מאז תור אחרון</p>
                      <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">
                        {lastBooking.daysSince !== null ? String(lastBooking.daysSince) : "—"}
                      </p>
                    </div>
                    {selectedClient.createdAt && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">לקוח מאז</p>
                        <p className="text-sm font-semibold text-slate-900 md:font-normal md:text-base">
                          {new Date(selectedClient.createdAt).toLocaleDateString("he-IL")}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 md:mt-4 space-y-0.5">
                    <p className="text-xs text-slate-500 font-medium md:text-sm md:text-slate-700">הערות לקוח</p>
                    <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap md:font-normal md:text-base" dir="rtl">
                      {(selectedClient.notes ?? selectedClient.clientNotes)?.trim() ? (selectedClient.notes ?? selectedClient.clientNotes)!.trim() : "—"}
                    </p>
                  </div>
                </div>

                {/* Action buttons — same height, side by side, Delete (red outline) | Edit (primary) */}
                <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openDeleteModal(selectedClient)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg touch-manipulation"
                  >
                    <Trash2 className="w-4 h-4 flex-shrink-0" />
                    מחק לקוח
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedClient)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-caleno-ink hover:bg-[#1E293B] text-white text-sm font-medium rounded-lg touch-manipulation"
                  >
                    <Pencil className="w-4 h-4 flex-shrink-0" />
                    ערוך לקוח
                  </button>
                </div>

                {/* Tabs Navigation — scrollable on mobile */}
                <div className="mt-6 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                  <AdminTabs<TabType>
                    tabs={clientTabs}
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    className="mb-4 md:mb-6"
                  />
                </div>

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
                      {archivedLoadError && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-right">
                          <p className="text-sm text-amber-700">{archivedLoadError}</p>
                        </div>
                      )}

                      {bookingsLoading ? (
                        <p className="text-sm text-slate-500 text-center py-8">טוען תורים…</p>
                      ) : clientBookings.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">אין תורים רשומים</p>
                      ) : (
                        <div className="space-y-3">
                          {clientBookings.map((booking) => {
                            const displayedStatus =
                              booking.displayedStatus ??
                              booking.statusAtArchive ??
                              booking.status ??
                              "booked";
                            if (process.env.NODE_ENV !== "production") {
                              console.log("HISTORY ITEM", {
                                id: booking.id,
                                source: booking._source ?? "unknown",
                                path: booking._path ?? "unknown",
                                statusAtArchive: booking.statusAtArchive,
                                status: booking.status,
                                displayedStatus,
                              });
                            }
                            return (
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
                                  <div className="md:col-span-4 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-slate-600 font-medium">
                                      סטטוס: {historyStatusLabel(displayedStatus)}
                                    </span>
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                      {booking.whatsappStatus === "cancelled" ||
                                      displayedStatus === "cancelled" ||
                                      displayedStatus === "canceled"
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
                          );
                          })}
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
              </AdminCard>
            ) : (
              <AdminCard className="p-6">
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-2">בחר לקוח מהרשימה</p>
                  <p className="text-sm text-slate-400">
                    פרטי הלקוח והיסטוריית התורים יופיעו כאן
                  </p>
                </div>
              </AdminCard>
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
                      className="mt-2 text-sm text-caleno-deep hover:text-caleno-ink underline"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep text-sm"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep text-sm"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep text-sm"
                    placeholder="לדוגמה: client@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תגיות ידניות</label>
                  <div className="rounded-lg border border-slate-300 p-3 space-y-2 max-h-32 overflow-y-auto">
                    {manualTags.length === 0 && <p className="text-xs text-slate-500">אין תגיות מוגדרות בהגדרות לקוחות.</p>}
                    {manualTags.map((tag) => {
                      const checked = newClientForm.manualTagIds.includes(tag.id);
                      return (
                        <label key={tag.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setNewClientForm((prev) => ({
                                ...prev,
                                manualTagIds: e.target.checked
                                  ? [...prev.manualTagIds, tag.id]
                                  : prev.manualTagIds.filter((id) => id !== tag.id),
                              }))
                            }
                          />
                          <span>{tag.label}</span>
                        </label>
                      );
                    })}
                  </div>
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep text-sm resize-none"
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
                    className="flex-1 px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">תגיות ידניות</label>
                  <div className="rounded-lg border border-slate-300 p-3 space-y-2 max-h-32 overflow-y-auto">
                    {manualTags.length === 0 && <p className="text-xs text-slate-500">אין תגיות מוגדרות בהגדרות לקוחות.</p>}
                    {manualTags.map((tag) => {
                      const checked = editForm.manualTagIds.includes(tag.id);
                      return (
                        <label key={tag.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                manualTagIds: e.target.checked
                                  ? [...prev.manualTagIds, tag.id]
                                  : prev.manualTagIds.filter((id) => id !== tag.id),
                              }))
                            }
                          />
                          <span>{tag.label}</span>
                        </label>
                      );
                    })}
                  </div>
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
                  className="flex-1 px-4 py-2 bg-caleno-ink text-white rounded-lg shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:opacity-50"
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
              <h2 className="text-xl font-bold text-slate-900 mb-2">מחיקת לקוח</h2>
              <p className="text-sm text-slate-600 mb-4">
                מחיקת הלקוח תמחק גם את כל ההזמנות שלו. פעולה זו לא ניתנת לשחזור.
              </p>
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
                    (deleteConfirmText.trim() !== "מחק" && deleteConfirmText.trim() !== deleteClient.id)
                  }
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? "מוחק…" : "מחק לקוח"}
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
                מחיקת הלקוחות תמחק גם את כל ההזמנות שלהם. פעולה זו לא ניתנת לשחזור.
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
