"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { X, Plus, Pencil, Trash2, MoreVertical } from "lucide-react";
import type { PricingItem } from "@/types/pricingItem";
import type { SiteService } from "@/types/siteConfig";
import {
  subscribePricingItems,
  createPricingItem,
  updatePricingItem,
  deletePricingItem,
} from "@/lib/firestorePricing";
import {
  subscribeSiteServices,
  addSiteService,
  updateSiteService,
  deleteSiteService,
  migrateServicesFromSubcollection,
} from "@/lib/firestoreSiteServices";
import DurationMinutesStepper from "@/components/admin/DurationMinutesStepper";
import { parseNumberOrRange, formatNumberOrRange } from "@/lib/parseNumberOrRange";
import { formatPriceDisplay } from "@/lib/formatPrice";
import type { MultiBookingCombo, MultiBookingComboInput, MultiBookingAutoStep } from "@/types/multiBookingCombo";
import { validateMultiBookingComboInput } from "@/types/multiBookingCombo";
import {
  subscribeMultiBookingCombos,
  createMultiBookingCombo,
  updateMultiBookingCombo,
  deleteMultiBookingCombo,
} from "@/lib/firestoreMultiBookingCombos";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";

// Module-level guard: only one create can run at a time (survives Strict Mode remount / duplicate triggers).
let createServiceInProgress = false;

export default function ServicesPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { user } = useAuth();
  // siteId from URL is the site document ID (sites/{siteId})

  const [services, setServices] = useState<SiteService[]>([]);
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Selected service tab (service id). "__UNASSIGNED__" for unassigned items. */
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PricingItem | null>(null);
  /** When set, the "Add service type" modal was opened from a specific service card; hide service dropdown and show parent as read-only. */
  const [editingItemParentService, setEditingItemParentService] = useState<{ id: string; name: string } | null>(null);
  const [editingService, setEditingService] = useState<SiteService | null>(null);
  const [durationInputValue, setDurationInputValue] = useState<string>("");
  const [priceInputValue, setPriceInputValue] = useState<string>("");
  const [followUpNameInputValue, setFollowUpNameInputValue] = useState<string>("");
  const [followUpDurationInputValue, setFollowUpDurationInputValue] = useState<string>("");
  const [followUpWaitInputValue, setFollowUpWaitInputValue] = useState<string>("0");
  const [followUpTextInputValue, setFollowUpTextInputValue] = useState<string>("");
  const [followUpPriceInputValue, setFollowUpPriceInputValue] = useState<string>("");

  const FOLLOWUP_TEXT_MAX_LENGTH = 50;

  /** Draft for "add new service" — same shape as edit modal; id "new" triggers create on save. */
  const NEW_SERVICE_DRAFT: SiteService = {
    id: "new",
    name: "",
    color: "#3B82F6",
    description: "",
    price: 0,
    enabled: true,
  };

  const isServiceCreateMode = editingService?.id === "new";

  // Multi-booking combos (rule-based: trigger set → ordered sequence)
  const [combos, setCombos] = useState<MultiBookingCombo[]>([]);
  const [comboModal, setComboModal] = useState<{ type: "create" } | { type: "edit"; combo: MultiBookingCombo } | null>(null);
  const [comboForm, setComboForm] = useState<{
    name: string;
    triggerServiceTypeIds: string[];
    orderedServiceTypeIds: string[];
    autoSteps: MultiBookingAutoStep[];
    isActive: boolean;
  }>({ name: "", triggerServiceTypeIds: [], orderedServiceTypeIds: [], autoSteps: [], isActive: true });
  const [openCombos, setOpenCombos] = useState(false);
  const [showNewServiceReminderModal, setShowNewServiceReminderModal] = useState(false);
  const [isSavingService, setSavingService] = useState(false);
  /** Service id whose 3-dot menu is open (null = none). */
  const [serviceMenuOpenId, setServiceMenuOpenId] = useState<string | null>(null);
  const serviceMenuRef = useRef<HTMLDivElement>(null);
  /** Position for portal-rendered dropdown (so it's not clipped by overflow). */
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  /** Pricing item id whose 3-dot menu is open (null = none). */
  const [itemMenuOpenId, setItemMenuOpenId] = useState<string | null>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const [itemMenuPosition, setItemMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (serviceMenuOpenId == null) {
      setDropdownPosition(null);
      return;
    }
    const measure = () => {
      const el = serviceMenuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 160 });
    };
    const raf = requestAnimationFrame(measure);
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (serviceMenuRef.current?.contains(target)) return;
      const portalRoot = document.getElementById("services-tab-dropdown-portal");
      if (portalRoot?.contains(target)) return;
      setServiceMenuOpenId(null);
    };
    document.addEventListener("click", close, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", close, true);
    };
  }, [serviceMenuOpenId]);

  useEffect(() => {
    if (itemMenuOpenId == null) {
      setItemMenuPosition(null);
      return;
    }
    const measure = () => {
      const el = itemMenuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setItemMenuPosition({ top: rect.bottom + 4, left: rect.right - 160 });
    };
    const raf = requestAnimationFrame(measure);
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (itemMenuRef.current?.contains(target)) return;
      const portalRoot = document.getElementById("services-item-dropdown-portal");
      if (portalRoot?.contains(target)) return;
      setItemMenuOpenId(null);
    };
    document.addEventListener("click", close, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", close, true);
    };
  }, [itemMenuOpenId]);

  // Prevent double submission: only one create/update at a time (e.g. double-click or duplicate trigger)
  const savingServiceRef = useRef(false);

  // Track first load to set loading state only once
  const didFirstLoad = useRef(false);
  const previousServicesRef = useRef<SiteService[]>([]);
  const previousPricingItemsRef = useRef<PricingItem[]>([]);

  // Load services and pricing items
  useEffect(() => {
    if (!siteId) return;

    // Reset first load flag when siteId changes
    didFirstLoad.current = false;
    previousServicesRef.current = [];
    previousPricingItemsRef.current = [];
    setLoading(true);
    
    // Run migration on first load
    migrateServicesFromSubcollection(siteId).catch((err) => {
      console.error("[ServicesPage] Migration error (non-fatal)", err);
    });
    
    // Define callbacks inside useEffect to avoid stale closures
    // Use refs to track previous state and prevent unnecessary updates
    const handleServicesUpdate = (svcs: SiteService[]) => {
      // Dedupe by id so we never show two rows for the same service (e.g. from duplicate create or subscription glitch)
      const byId = new Map<string, SiteService>();
      svcs.forEach((s) => {
        if (s?.id && !byId.has(s.id)) byId.set(s.id, s);
      });
      const deduped = Array.from(byId.values());
      // Only show enabled services, sorted by sortOrder then name
      const enabledServices = deduped
        .filter((s) => s.enabled !== false)
        .sort((a, b) => {
          if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
            return a.sortOrder - b.sortOrder;
          }
          return a.name.localeCompare(b.name);
        });
      
      // Only update state if services actually changed
      const servicesChanged = 
        enabledServices.length !== previousServicesRef.current.length ||
        enabledServices.some((s, i) => {
          const prev = previousServicesRef.current[i];
          return !prev || s.id !== prev.id || s.name !== prev.name || s.enabled !== prev.enabled;
        });
      
      if (servicesChanged) {
        previousServicesRef.current = enabledServices;
        setServices(enabledServices);
      }
      
      // Set loading false only on first load
      if (!didFirstLoad.current) {
        setLoading(false);
        didFirstLoad.current = true;
      }
    };

    const handleServicesError = (err: Error) => {
      console.error("Failed to load services", err);
      setError("שגיאה בטעינת השירותים");
      if (!didFirstLoad.current) {
        setLoading(false);
        didFirstLoad.current = true;
      }
    };

    const handlePricingItemsUpdate = (items: PricingItem[]) => {
      // Backward compatibility: filter out items without serviceId
      const validItems = items.filter((item) => {
        const serviceId = item.serviceId || item.service;
        if (!serviceId) {
          console.warn("[Pricing] Item missing serviceId/service, skipping:", item.id);
          return false;
        }
        return true;
      });
      
      // Only update state if items actually changed
      const itemsChanged =
        validItems.length !== previousPricingItemsRef.current.length ||
        validItems.some((item, i) => {
          const prev = previousPricingItemsRef.current[i];
          return !prev || item.id !== prev.id || item.updatedAt !== prev.updatedAt;
        });
      
      if (itemsChanged) {
        previousPricingItemsRef.current = validItems;
        setPricingItems(validItems);
      }
      
      // Set loading false only on first load
      if (!didFirstLoad.current) {
        setLoading(false);
        didFirstLoad.current = true;
      }
    };

    const handlePricingItemsError = (err: Error) => {
      console.error("Failed to load pricing items", err);
      setError("שגיאה בטעינת המחירים");
      if (!didFirstLoad.current) {
        setLoading(false);
        didFirstLoad.current = true;
      }
    };
    
    const unsubscribeServices = subscribeSiteServices(
      siteId,
      handleServicesUpdate,
      handleServicesError
    );

    const unsubscribeItems = subscribePricingItems(
      siteId,
      handlePricingItemsUpdate,
      handlePricingItemsError
    );

    const unsubscribeCombos = subscribeMultiBookingCombos(siteId, (list) => setCombos(list));

    return () => {
      unsubscribeServices();
      unsubscribeItems();
      unsubscribeCombos();
    };
  }, [siteId]);

  // Get active service IDs for dropdowns
  const activeServiceIds = services.map((s) => s.name).sort();

  // Group items by serviceId (with backward compatibility)
  const itemsByService = pricingItems.reduce((acc, item) => {
    // Use serviceId if available, fallback to service for backward compatibility
    const serviceId = item.serviceId || item.service;
    if (!serviceId) {
      // Items without serviceId will be shown in "Unassigned" section
      if (!acc["__UNASSIGNED__"]) {
        acc["__UNASSIGNED__"] = [];
      }
      acc["__UNASSIGNED__"].push(item);
      return acc;
    }
    if (!acc[serviceId]) {
      acc[serviceId] = [];
    }
    acc[serviceId].push(item);
    return acc;
  }, {} as Record<string, PricingItem[]>);

  // Get unassigned items: only those without serviceId OR whose serviceId matches no service (by id or name).
  // Must match by both s.id and s.name so items saved with service.id (e.g. from service card) are not treated as unassigned.
  const unassignedItems = (() => {
    const itemsWithoutServiceId = itemsByService["__UNASSIGNED__"] || [];
    const itemsWithUnmatchedService = pricingItems.filter((item) => {
      const serviceId = item.serviceId || item.service;
      if (!serviceId) return false; // Already in __UNASSIGNED__
      const matchesSomeService = services.some((s) => s.id === serviceId || s.name === serviceId);
      return !matchesSomeService;
    });
    return [...itemsWithoutServiceId, ...itemsWithUnmatchedService];
  })();

  const handleAddItem = (serviceOrId: SiteService | string) => {
    const serviceId = typeof serviceOrId === "string" ? serviceOrId : serviceOrId.id;
    const itemsForService = typeof serviceOrId === "string"
      ? (itemsByService[serviceId] || [])
      : (itemsByService[serviceOrId.id] || itemsByService[serviceOrId.name] || []);
    const parentService =
      typeof serviceOrId === "string"
        ? (() => {
            const svc = services.find((s) => s.id === serviceOrId || s.name === serviceOrId);
            return svc ? { id: svc.id, name: svc.name } : null;
          })()
        : { id: serviceOrId.id, name: serviceOrId.name };
    setEditingItemParentService(parentService);
    const newItem: Omit<PricingItem, "id" | "createdAt" | "updatedAt"> = {
      serviceId,
      service: serviceId,
      durationMinMinutes: 30,
      durationMaxMinutes: 30,
      price: 0,
      order: itemsForService.length,
      hasFollowUp: false,
      followUp: null,
    };
    setEditingItem({
      ...newItem,
      id: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setDurationInputValue("30");
    setPriceInputValue("0");
    setFollowUpNameInputValue("");
    setFollowUpDurationInputValue("");
    setFollowUpWaitInputValue("0");
    setFollowUpTextInputValue("");
    setFollowUpPriceInputValue("");
  };

  const handleEditItem = (item: PricingItem) => {
    const serviceId = item.serviceId || item.service;
    const parentService =
      serviceId && services.length
        ? (() => {
            const svc = services.find((s) => s.id === serviceId || s.name === serviceId);
            return svc ? { id: svc.id, name: svc.name } : null;
          })()
        : null;
    setEditingItemParentService(parentService);
    const convertedItem = { ...item };
    setDurationInputValue(formatNumberOrRange(convertedItem.durationMinMinutes, convertedItem.durationMaxMinutes));
    setPriceInputValue(formatNumberOrRange(
      convertedItem.priceRangeMin ?? convertedItem.price,
      convertedItem.priceRangeMax
    ));
    setFollowUpNameInputValue(convertedItem.followUp?.name ?? "");
    setFollowUpDurationInputValue(convertedItem.followUp?.durationMinutes != null ? String(convertedItem.followUp.durationMinutes) : "");
    setFollowUpWaitInputValue(String(convertedItem.followUp?.waitMinutes ?? 0));
    setFollowUpTextInputValue(convertedItem.followUp?.text ?? "");
    setFollowUpPriceInputValue(
      convertedItem.followUp && typeof convertedItem.followUp.price === "number"
        ? String(convertedItem.followUp.price)
        : ""
    );
    setEditingItem(convertedItem);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את הפריט?") || !siteId) return;
    try {
      await deletePricingItem(siteId, itemId);
    } catch (err) {
      console.error("Failed to delete pricing item", err);
      setError("שגיאה במחיקת הפריט");
    }
  };

  // Helper function to remove undefined values from object
  const removeUndefined = (obj: any): any => {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined)
    );
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;

    // Early validation guard - prevent saving if button should be disabled
    const serviceId = editingItem.serviceId || editingItem.service;
    if (!serviceId || !serviceId.trim()) {
      setError("בחר שירות");
      return;
    }
    if (!editingItem.durationMinMinutes || editingItem.durationMinMinutes < 1) {
      setError("משך השירות חייב להיות גדול או שווה ל-1 דקה");
      return;
    }
    if (editingItem.hasFollowUp) {
      const name = (editingItem.followUp?.name ?? followUpNameInputValue ?? editingItemParentService?.name ?? "").trim();
      const durationMinutes = editingItem.followUp?.durationMinutes ?? (followUpDurationInputValue ? parseInt(followUpDurationInputValue, 10) : NaN);
      const waitMinutes = editingItem.followUp?.waitMinutes ?? (followUpWaitInputValue ? parseInt(followUpWaitInputValue, 10) : 0);
      if (!name) {
        setError("נא לבחור שירות לשלב 2");
        return;
      }
      if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        setError("משך שלב 2 חייב להיות לפחות 1 דקה");
        return;
      }
      if (!Number.isFinite(waitMinutes) || waitMinutes < 0) {
        setError("המתנה אחרי שלב 1 חייבת להיות 0 ומעלה");
        return;
      }
      const fuPriceRaw = (followUpPriceInputValue ?? "").trim().replace(",", ".");
      const fuPriceNum = fuPriceRaw === "" ? 0 : Number(fuPriceRaw);
      if (!Number.isFinite(fuPriceNum) || fuPriceNum < 0) {
        setError("מחיר שלב המשך חייב להיות מספר חיובי או 0");
        return;
      }
    }

    try {
      setError(null);
      
      // Build payload - only include defined values, use null for optional empty values
      // Duration fields: use the service duration value (both min and max set to same value)
      const durationMin = editingItem.durationMinMinutes && editingItem.durationMinMinutes >= 1 
        ? editingItem.durationMinMinutes 
        : 30; // Fallback default
      const durationMax = editingItem.durationMaxMinutes && editingItem.durationMaxMinutes >= 1
        ? editingItem.durationMaxMinutes
        : durationMin; // Use same as min for single service duration
      
      const itemData: any = {
        serviceId: serviceId, // Required field
        service: serviceId, // Set for backward compatibility
        durationMinMinutes: durationMin,
        durationMaxMinutes: durationMax,
        order: editingItem.order || 0,
        hasFollowUp: editingItem.hasFollowUp || false,
      };

      if (editingItem.type !== undefined && editingItem.type !== null && editingItem.type.trim()) {
        itemData.type = editingItem.type;
      } else {
        itemData.type = null;
      }

      // Follow-up: hasFollowUp + followUp { name, serviceId, durationMinutes, waitMinutes } | null (follow-up service is user-selected from dropdown)
      const followUpName = (editingItem.followUp?.name ?? followUpNameInputValue ?? "").trim();
      const followUpServiceId = editingItem.followUp?.serviceId ?? services.find((s) => s.name === followUpName)?.id;
      const followUpDuration = editingItem.followUp?.durationMinutes ?? (followUpDurationInputValue ? parseInt(followUpDurationInputValue, 10) : NaN);
      const followUpWait = editingItem.followUp?.waitMinutes ?? (followUpWaitInputValue ? parseInt(followUpWaitInputValue, 10) : 0);
      const followUpTextRaw = (editingItem.followUp?.text ?? followUpTextInputValue).trim();
      const followUpText = followUpTextRaw.slice(0, FOLLOWUP_TEXT_MAX_LENGTH) || undefined;
      const followUpPriceRaw = (followUpPriceInputValue ?? "").trim().replace(",", ".");
      const followUpPriceSaved =
        followUpPriceRaw === "" ? 0 : Math.max(0, Number(followUpPriceRaw));
      if (editingItem.hasFollowUp && followUpName && Number.isFinite(followUpDuration) && followUpDuration >= 1 && Number.isFinite(followUpWait) && followUpWait >= 0) {
        itemData.hasFollowUp = true;
        itemData.followUp = {
          name: followUpName,
          ...(followUpServiceId && { serviceId: followUpServiceId }),
          durationMinutes: followUpDuration,
          waitMinutes: followUpWait,
          price: Number.isFinite(followUpPriceSaved) ? followUpPriceSaved : 0,
          ...(followUpText && { text: followUpText }),
        };
      } else {
        itemData.hasFollowUp = false;
        itemData.followUp = null;
      }

      // Handle price: support both single and range
      if (editingItem.priceRangeMin !== undefined && editingItem.priceRangeMax !== undefined) {
        // Range price
        itemData.priceRangeMin = editingItem.priceRangeMin;
        itemData.priceRangeMax = editingItem.priceRangeMax;
        itemData.price = undefined; // Clear single price when using range
      } else if (editingItem.price !== undefined && editingItem.price !== null) {
        // Single price
        itemData.price = editingItem.price;
        itemData.priceRangeMin = undefined;
        itemData.priceRangeMax = undefined;
      } else {
        // No price
        itemData.price = undefined;
        itemData.priceRangeMin = undefined;
        itemData.priceRangeMax = undefined;
      }
      // Always set notes so clearing the field persists (null/empty clears it in Firestore)
      const trimmedNotes = (editingItem.notes ?? "").trim();
      itemData.notes = trimmedNotes || null;

      const cleanItemData = removeUndefined(itemData) as Record<string, unknown>;
      console.log("[Services] service doc saved fields:", { hasFollowUp: cleanItemData.hasFollowUp, followUp: cleanItemData.followUp });

      const deleteLegacyFollowUpFields = ["followUpServiceId", "followUpServiceRefId", "followUpDurationMinutes", "followUpWaitMinutes", "waitMinutes"];

      if (editingItem.id === "new") {
        await createPricingItem(siteId, cleanItemData as Omit<PricingItem, "id" | "createdAt" | "updatedAt">);
      } else {
        await updatePricingItem(siteId, editingItem.id, cleanItemData as Partial<Omit<PricingItem, "id" | "createdAt">> & Record<string, unknown>, { deleteFields: deleteLegacyFollowUpFields });
      }
      setEditingItem(null);
      setEditingItemParentService(null);
      setDurationInputValue("");
      setPriceInputValue("");
      setFollowUpNameInputValue("");
      setFollowUpDurationInputValue("");
      setFollowUpWaitInputValue("0");
      setFollowUpTextInputValue("");
      setFollowUpPriceInputValue("");
    } catch (err) {
      console.error("Failed to save pricing item", err);
      setError("שגיאה בשמירת הפריט");
    }
  };

  // Keep selected tab in sync with available services (e.g. after add/delete)
  useEffect(() => {
    if (services.length === 0 && unassignedItems.length === 0) {
      setSelectedServiceId(null);
      return;
    }
    const hasUnassigned = unassignedItems.length > 0;
    const validIds = new Set(services.map((s) => s.id));
    if (hasUnassigned) validIds.add("__UNASSIGNED__");
    if (!selectedServiceId || !validIds.has(selectedServiceId)) {
      setSelectedServiceId(services.length > 0 ? services[0].id : "__UNASSIGNED__");
    }
  }, [services, unassignedItems.length, selectedServiceId]);

  /** Resolved tab for display (avoids empty content before effect runs). */
  const activeTabId = selectedServiceId ?? (services[0]?.id ?? (unassignedItems.length > 0 ? "__UNASSIGNED__" : null));

  const handleEditService = (service: SiteService) => {
    setEditingService(service);
  };

  const handleSaveService = async () => {
    if (!editingService || !editingService.name.trim() || !siteId) return;
    if (savingServiceRef.current || createServiceInProgress) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[handleSaveService] blocked duplicate call (already saving)", {
          savingRef: savingServiceRef.current,
          moduleGuard: createServiceInProgress,
        });
      }
      return;
    }
    savingServiceRef.current = true;
    createServiceInProgress = true;
    setSavingService(true);
    if (process.env.NODE_ENV !== "production") {
      console.log("[handleSaveService] invoked once", { name: editingService.name.trim(), id: editingService.id });
    }
    try {
      // Normalize numeric fields: never send undefined to Firestore
      const priceRaw = editingService.price;
      const priceNum =
        priceRaw !== undefined && priceRaw !== null && priceRaw !== ""
          ? Number(priceRaw)
          : null;
      const price = typeof priceNum === "number" && !Number.isNaN(priceNum) && priceNum >= 0 ? priceNum : null;

      // Parent service has no duration in our data model; duration belongs to service types only.
      const description =
        editingService.description != null && String(editingService.description).trim() !== ""
          ? String(editingService.description).trim()
          : null;

      const isCreate = editingService.id === "new";

      if (isCreate) {
        const payload: Omit<SiteService, "id"> = {
          name: editingService.name.trim(),
          enabled: editingService.enabled !== false,
          color: editingService.color || "#3B82F6",
          description: description ?? undefined,
          price: price != null && price >= 0 ? price : undefined,
        };
        await addSiteService(siteId, payload);
        // Do not optimistically setServices here: the Firestore subscription will update
        // the list once. Adding optimistically would race with the subscription and
        // can result in the new service appearing twice (duplicate/mirrored rows).
        setEditingService(null);
        setShowNewServiceReminderModal(true);
        return;
      }

      const existingService = services.find((s) => s.id === editingService.id);
      const updatedService = {
        ...editingService,
        name: editingService.name.trim(),
        enabled: editingService.enabled !== false,
        color: editingService.color || "#3B82F6",
        description: description ?? undefined,
        price: price ?? undefined,
        imageUrl: existingService?.imageUrl ?? editingService.imageUrl,
      };

      setServices((prev) =>
        prev.map((s) => (s.id === updatedService.id ? updatedService : s))
      );

      const updates: Partial<Omit<SiteService, "id">> = {
        name: updatedService.name,
        enabled: updatedService.enabled,
        color: updatedService.color,
      };
      if (description !== null) updates.description = description;
      else updates.description = undefined;
      if (price !== null) updates.price = price;
      else updates.price = undefined;

      await updateSiteService(siteId, editingService.id, updates);

      setEditingService(null);
    } catch (err) {
      console.error("Failed to save service", err);
      setError(editingService?.id === "new" ? "שגיאה ביצירת שירות" : "שגיאה בעדכון שירות");
    } finally {
      savingServiceRef.current = false;
      createServiceInProgress = false;
      setSavingService(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service || !siteId) return;
    
    if (!confirm(`האם אתה בטוח שברצונך למחוק את השירות "${service.name}"? כל פריטי המחיר של שירות זה יימחקו.`)) return;
    
    try {
      // Delete all pricing items for this service
      const itemsToDelete = itemsByService[service.id] || itemsByService[service.name] || [];
      await Promise.all(itemsToDelete.map((item) => deletePricingItem(siteId, item.id)));
      
      // Delete service
      await deleteSiteService(siteId, serviceId);
    } catch (err) {
      console.error("Failed to delete service", err);
      setError("שגיאה במחיקת שירות");
    }
  };

  // Multi-booking combo handlers (service TYPES = pricing item ids)
  const getServiceTypeLabel = (item: PricingItem) => {
    const svcName = services.find((s) => s.id === item.serviceId || s.name === (item.serviceId || item.service))?.name ?? (item.serviceId || item.service || "");
    return item.type?.trim() ? `${svcName} – ${item.type}` : svcName;
  };
  const getPricingItemById = (id: string) => pricingItems.find((p) => p.id === id);
  const openComboCreate = () => {
    setComboForm({ name: "", triggerServiceTypeIds: [], orderedServiceTypeIds: [], autoSteps: [], isActive: true });
    setComboModal({ type: "create" });
  };
  const openComboEdit = (combo: MultiBookingCombo) => {
    setComboForm({
      name: combo.name,
      triggerServiceTypeIds: [...combo.triggerServiceTypeIds],
      orderedServiceTypeIds: [...combo.orderedServiceTypeIds],
      autoSteps: combo.autoSteps ? [...combo.autoSteps] : [],
      isActive: combo.isActive,
    });
    setComboModal({ type: "edit", combo });
  };
  const closeComboModal = () => setComboModal(null);
  const addTriggerServiceType = (typeId: string) => {
    if (comboForm.triggerServiceTypeIds.includes(typeId)) return;
    setComboForm((prev) => ({
      ...prev,
      triggerServiceTypeIds: [...prev.triggerServiceTypeIds, typeId],
      orderedServiceTypeIds: prev.orderedServiceTypeIds.includes(typeId)
        ? prev.orderedServiceTypeIds
        : [...prev.orderedServiceTypeIds, typeId],
    }));
  };
  const removeTriggerServiceType = (typeId: string) => {
    setComboForm((prev) => ({
      ...prev,
      triggerServiceTypeIds: prev.triggerServiceTypeIds.filter((id) => id !== typeId),
    }));
  };
  const addOrderedServiceType = (typeId: string) => {
    if (comboForm.orderedServiceTypeIds.includes(typeId)) return;
    setComboForm((prev) => ({ ...prev, orderedServiceTypeIds: [...prev.orderedServiceTypeIds, typeId] }));
  };
  const removeOrderedServiceTypeAt = (index: number) => {
    setComboForm((prev) => ({
      ...prev,
      orderedServiceTypeIds: prev.orderedServiceTypeIds.filter((_, i) => i !== index),
    }));
  };
  const moveOrderedServiceType = (index: number, direction: "up" | "down") => {
    setComboForm((prev) => {
      const arr = [...prev.orderedServiceTypeIds];
      const j = direction === "up" ? index - 1 : index + 1;
      if (j < 0 || j >= arr.length) return prev;
      [arr[index], arr[j]] = [arr[j]!, arr[index]!];
      return { ...prev, orderedServiceTypeIds: arr };
    });
  };
  const addAutoStep = (serviceId: string, durationMinutesOverride: number = 30) => {
    setComboForm((prev) => ({
      ...prev,
      autoSteps: [...prev.autoSteps, { serviceId, durationMinutesOverride, position: "end" }],
    }));
  };
  const removeAutoStepAt = (index: number) => {
    setComboForm((prev) => ({
      ...prev,
      autoSteps: prev.autoSteps.filter((_, i) => i !== index),
    }));
  };
  const updateAutoStepDuration = (index: number, durationMinutesOverride: number) => {
    setComboForm((prev) => ({
      ...prev,
      autoSteps: prev.autoSteps.map((step, i) =>
        i === index ? { ...step, durationMinutesOverride: Math.max(1, durationMinutesOverride) } : step
      ),
    }));
  };
  const saveCombo = async () => {
    if (!siteId || !comboForm.name.trim()) {
      setError("שם הקומבו חובה");
      return;
    }
    const input: MultiBookingComboInput = {
      name: comboForm.name.trim(),
      triggerServiceTypeIds: comboForm.triggerServiceTypeIds,
      orderedServiceTypeIds: comboForm.orderedServiceTypeIds,
      ...(comboForm.autoSteps.length > 0 && { autoSteps: comboForm.autoSteps }),
      isActive: comboForm.isActive,
    };
    const validation = validateMultiBookingComboInput(input);
    if (!validation.valid) {
      setError(validation.error ?? "תצורת קומבו לא תקינה");
      return;
    }
    try {
      setError(null);
      if (comboModal?.type === "create") {
        await createMultiBookingCombo(siteId, input);
      } else if (comboModal?.type === "edit" && comboModal.combo) {
        await updateMultiBookingCombo(siteId, comboModal.combo.id, input);
      }
      closeComboModal();
    } catch (err) {
      console.error("Failed to save combo", err);
      setError("שגיאה בשמירת הקומבו");
    }
  };
  const deleteCombo = async (combo: MultiBookingCombo) => {
    if (!siteId || !confirm(`למחוק את הקומבו "${combo.name}"?`)) return;
    try {
      await deleteMultiBookingCombo(siteId, combo.id);
    } catch (err) {
      console.error("Failed to delete combo", err);
      setError("שגיאה במחיקת הקומבו");
    }
  };

  const getServiceNameById = (id: string) => services.find((s) => s.id === id)?.name ?? id;

  const validPricingItemsForCombo = pricingItems.filter((item) => {
    const sid = item.serviceId || item.service;
    return !!sid && services.some((s) => s.id === sid || s.name === sid);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[#64748B] text-sm">טוען מחירים…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-4 sm:mb-6">
          <AdminPageHero
            title="שירותים"
            subtitle="ניהול שירותים ומחיריהם"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <AdminCard className="p-4 sm:p-6">
          {/* Unified Services and Pricing View */}
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">שירותים ומחירים</h2>
            <p className="text-xs sm:text-sm text-[#64748B] mt-1">
              ניהול שירותים וסוגי המחירים שלהם
            </p>
          </div>

          {/* Service tabs + content */}
          {services.length === 0 && unassignedItems.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-[#64748B] mb-4">אין שירותים עדיין</p>
              <p className="text-xs sm:text-sm text-slate-400 mb-4">
                לחץ על "הוסף שירות" כדי להתחיל
              </p>
              <button
                type="button"
                onClick={() => setEditingService({ ...NEW_SERVICE_DRAFT })}
                className="min-h-[44px] px-4 py-3 sm:py-2 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 touch-manipulation"
              >
                <Plus className="w-4 h-4" />
                הוסף שירות
              </button>
            </div>
          ) : (
            <>
              {/* Tabs navbar with Add service button on the right; each service tab has a 3-dot menu */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 border-b border-slate-200 pb-4 sm:pb-0 sm:mb-6 -mx-1 sm:mx-0">
                <button
                  type="button"
                  onClick={() => setEditingService({ ...NEW_SERVICE_DRAFT })}
                  className="shrink-0 min-h-[44px] px-4 py-3 sm:py-2 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 touch-manipulation order-first sm:order-none"
                >
                  <Plus className="w-4 h-4" />
                  הוסף שירות
                </button>
                <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 py-1 px-1 rounded-xl sm:rounded-full bg-white/40 border border-[#E2E8F0]/60 w-full">
                  {services.map((s) => {
                    const isSelected = activeTabId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center flex-row-reverse rounded-full touch-manipulation ${
                          isSelected
                            ? "bg-[#1E6F7C] text-white shadow-sm"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedServiceId(s.id)}
                          className={`min-h-[44px] px-3 sm:px-4 py-2.5 md:px-5 text-sm font-medium transition-all whitespace-nowrap touch-manipulation ${
                            isSelected
                              ? "text-white"
                              : "text-[#64748B] hover:bg-white/60 hover:text-[#1E6F7C] rounded-full"
                          }`}
                        >
                          {s.name}
                        </button>
                        {isSelected && (
                          <div className="relative pl-1.5" ref={serviceMenuOpenId === s.id ? serviceMenuRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setServiceMenuOpenId((prev) => (prev === s.id ? null : s.id));
                              }}
                              className="p-1.5 rounded-full transition-colors text-white/90 hover:bg-white/20"
                              aria-label="תפריט שירות"
                              aria-expanded={serviceMenuOpenId === s.id}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unassignedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedServiceId("__UNASSIGNED__")}
                      className={`min-h-[44px] px-3 sm:px-4 py-2.5 md:px-5 text-sm font-medium transition-all rounded-full touch-manipulation whitespace-nowrap ${
                        activeTabId === "__UNASSIGNED__"
                          ? "bg-[#1E6F7C] text-white shadow-sm"
                          : "text-[#64748B] hover:bg-white/60 hover:text-[#1E6F7C]"
                      }`}
                    >
                      לא משויך ({unassignedItems.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Content for selected tab */}
              {activeTabId === "__UNASSIGNED__" ? (
                <div className="space-y-4">
                  <p className="text-xs sm:text-sm text-[#64748B]">
                    פריטי מחיר שלא משויכים לשירות. ערוך פריט ובחר שירות כדי לשייך.
                  </p>
                  <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-lg border border-slate-200/60">
                    <table className="w-full text-xs sm:text-sm border-collapse min-w-[320px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">שירות</th>
                          <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">סוג</th>
                          <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">משך (דקות)</th>
                          <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">מחיר</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassignedItems.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">{item.serviceId || item.service || "-"}</td>
                            <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">
                              <div className="flex items-center justify-start gap-2 min-w-0">
                                <div className="relative shrink-0" ref={itemMenuOpenId === item.id ? itemMenuRef : undefined}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setItemMenuOpenId((prev) => (prev === item.id ? null : item.id));
                                    }}
                                    className="p-2 sm:p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 touch-manipulation"
                                    aria-label="תפריט פריט"
                                    aria-expanded={itemMenuOpenId === item.id}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </div>
                                <span className="truncate">{item.type || "-"}</span>
                              </div>
                            </td>
                            <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">
                              {item.durationMinMinutes === item.durationMaxMinutes ? `${item.durationMinMinutes}` : `${item.durationMinMinutes}-${item.durationMaxMinutes}`}
                            </td>
                            <td className="px-2 sm:px-3 py-2.5 text-slate-900 font-medium">{formatPriceDisplay(item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : activeTabId && services.some((s) => s.id === activeTabId) ? (() => {
                const service = services.find((s) => s.id === activeTabId)!;
                const items = itemsByService[service.id] || itemsByService[service.name] || [];
                return (
                  <div className="space-y-4">
                    <span className="text-xs sm:text-sm text-[#64748B]">
                      {items.length === 0 ? "אין סוגי מחיר" : `${items.length} סוגי מחיר`}
                    </span>
                    {items.length === 0 ? (
                      <p className="text-xs sm:text-sm text-[#64748B] text-center py-6 sm:py-8">
                        אין סוגי שירות בשירות זה. לחץ על "הוסף סוג שירות" כדי להוסיף.
                      </p>
                    ) : (
                      <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-lg border border-slate-200/60">
                        <table className="w-full text-xs sm:text-sm border-collapse min-w-[360px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">סוג</th>
                              <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">משך (דקות)</th>
                              <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">מחיר</th>
                              <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">המשך טיפול</th>
                              <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">הערות</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">
                                  <div className="flex items-center justify-start gap-2 min-w-0">
                                    <div className="relative shrink-0" ref={itemMenuOpenId === item.id ? itemMenuRef : undefined}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setItemMenuOpenId((prev) => (prev === item.id ? null : item.id));
                                        }}
                                        className="p-2 sm:p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 touch-manipulation"
                                        aria-label="תפריט פריט"
                                        aria-expanded={itemMenuOpenId === item.id}
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                      </button>
                                    </div>
                                    <span className="truncate">{item.type || "-"}</span>
                                  </div>
                                </td>
                                <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">
                                  {item.durationMinMinutes === item.durationMaxMinutes ? `${item.durationMinMinutes}` : `${item.durationMinMinutes}-${item.durationMaxMinutes}`}
                                </td>
                                <td className="px-2 sm:px-3 py-2.5 text-slate-900 font-medium">{formatPriceDisplay(item)}</td>
                                <td className="px-2 sm:px-3 py-2.5 text-[#64748B] text-xs">
                                  {item.hasFollowUp && item.followUp ? (
                                    <div className="text-caleno-deep font-medium">
                                      {item.followUp.name}
                                      {item.followUp.text?.trim() ? ` - ${item.followUp.text.trim()}` : ""} ({item.followUp.durationMinutes} דק׳)
                                      {item.followUp.waitMinutes ? `, המתנה ${item.followUp.waitMinutes} דק׳` : ""}
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-2 sm:px-3 py-2.5 text-[#64748B] text-xs">
                                  {item.notes ? <div>{item.notes}</div> : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAddItem(service)}
                      className="w-full min-h-[48px] py-3 px-4 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:border-caleno-deep/50 hover:text-caleno-deep hover:bg-caleno-50/50 text-sm font-medium transition-colors flex items-center justify-center gap-2 touch-manipulation"
                    >
                      <Plus className="w-4 h-4" />
                      הוסף סוג שירות
                    </button>
                  </div>
                );
              })() : null}
            </>
          )}
        </AdminCard>

        {/* Multi-Booking Combos */}
        <div className="mt-4 sm:mt-6 bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">כללי Multi-Booking (קומבו)</h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1">
                אם הלקוח בוחר סוגי שירותים (מחירון) → מתזמן לפי הסדר + משך והמתנה כמו ב follow-up
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenCombos((v) => !v)}
              className="min-h-[44px] px-4 py-2.5 text-[#64748B] hover:bg-slate-100 rounded-lg text-sm font-medium touch-manipulation shrink-0"
            >
              {openCombos ? "הסתר" : "הצג"}
            </button>
          </div>
          {openCombos && (
            <>
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={openComboCreate}
                  className="min-h-[44px] px-4 py-2.5 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium flex items-center gap-2 touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                  הוסף קומבו
                </button>
              </div>
              {combos.length === 0 ? (
                <p className="text-xs sm:text-sm text-[#64748B] text-center py-6">אין קומבו. לחץ על &quot;הוסף קומבו&quot; כדי ליצור.</p>
              ) : (
                <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-lg border border-slate-200/60">
                  <table className="w-full text-xs sm:text-sm border-collapse min-w-[320px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">שם</th>
                        <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">אם בוחרים</th>
                        <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">מתזמן בסדר</th>
                        <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">פעיל</th>
                        <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combos.map((combo) => (
                        <tr key={combo.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 sm:px-3 py-2.5 font-medium text-slate-900">{combo.name}</td>
                          <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">
                            {combo.triggerServiceTypeIds.map((typeId) => {
                            const p = getPricingItemById(typeId);
                            return p ? getServiceTypeLabel(p) : typeId;
                          }).join(", ")}
                          </td>
                          <td className="px-2 sm:px-3 py-2.5 text-[#64748B]">
                            {combo.orderedServiceTypeIds.map((typeId) => {
                              const p = getPricingItemById(typeId);
                              return p ? getServiceTypeLabel(p) : typeId;
                            }).join(" → ")}
                          </td>
                          <td className="px-2 sm:px-3 py-2.5">{combo.isActive ? "כן" : "לא"}</td>
                          <td className="px-2 sm:px-3 py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => openComboEdit(combo)}
                                className="p-2 sm:p-1.5 hover:bg-[rgba(30,111,124,0.08)] rounded text-caleno-deep touch-manipulation"
                                title="ערוך"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCombo(combo)}
                                className="p-2 sm:p-1.5 hover:bg-red-50 rounded text-red-600 touch-manipulation"
                                title="מחק"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

      {/* Combo Create/Edit Modal — rule builder: trigger set + ordered sequence */}
      {comboModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-t-2xl sm:rounded-3xl shadow-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] flex flex-col mt-auto sm:mt-0">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {comboModal.type === "create" ? "הוסף כלל Multi-Booking" : "ערוך כלל"}
              </h3>
              <button type="button" onClick={closeComboModal} className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 -m-2 hover:bg-slate-100 rounded-lg touch-manipulation" aria-label="סגור">
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם הכלל *</label>
                <input
                  type="text"
                  value={comboForm.name}
                  onChange={(e) => setComboForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אם הלקוח בוחר את סוגי השירותים האלה (הסדר לא משנה)</label>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) addTriggerServiceType(v);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep mb-2"
                >
                  <option value="">הוסף סוג שירות לתנאי...</option>
                  {validPricingItemsForCombo.filter((p) => !comboForm.triggerServiceTypeIds.includes(p.id)).map((p) => (
                    <option key={p.id} value={p.id}>{getServiceTypeLabel(p)}</option>
                  ))}
                </select>
                <ul className="flex flex-wrap gap-2">
                  {comboForm.triggerServiceTypeIds.map((typeId) => {
                    const item = getPricingItemById(typeId);
                    return (
                      <li key={typeId}>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-sm">
                          {item ? getServiceTypeLabel(item) : typeId}
                          <button type="button" onClick={() => removeTriggerServiceType(typeId)} className="p-0.5 hover:bg-slate-200 rounded" aria-label="הסר">×</button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תזמן בסדר הזה (משך + המתנה לפי סוג השירות)</label>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) addOrderedServiceType(v);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep mb-2"
                >
                  <option value="">הוסף סוג שירות לרצף...</option>
                  {validPricingItemsForCombo.map((p) => (
                    <option key={p.id} value={p.id} disabled={comboForm.orderedServiceTypeIds.includes(p.id)}>
                      {getServiceTypeLabel(p)}
                    </option>
                  ))}
                </select>
                <ul className="space-y-1">
                  {comboForm.orderedServiceTypeIds.map((typeId, i) => {
                    const item = getPricingItemById(typeId);
                    const isAutoAdded = !comboForm.triggerServiceTypeIds.includes(typeId);
                    const durationMin = item?.durationMinMinutes ?? item?.durationMaxMinutes ?? 0;
                    const waitMin = (item?.hasFollowUp && item?.followUp) ? Math.max(0, item.followUp.waitMinutes ?? 0) : 0;
                    return (
                      <li key={`${typeId}-${i}`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
                        <span className="text-sm font-medium text-slate-800">
                          {i + 1}. {item ? getServiceTypeLabel(item) : typeId}
                          {isAutoAdded && (
                            <span className="mr-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">נוסף אוטומטית</span>
                          )}
                          <span className="mr-2 text-xs text-[#64748B]">({durationMin} דק׳ {waitMin > 0 ? `+ המתנה ${waitMin} דק׳` : ""})</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveOrderedServiceType(i, "up")} disabled={i === 0} className="p-1 rounded text-[#64748B] disabled:opacity-40" aria-label="למעלה">↑</button>
                          <button type="button" onClick={() => moveOrderedServiceType(i, "down")} disabled={i === comboForm.orderedServiceTypeIds.length - 1} className="p-1 rounded text-[#64748B] disabled:opacity-40" aria-label="למטה">↓</button>
                          <button type="button" onClick={() => removeOrderedServiceTypeAt(i)} className="p-1 hover:bg-red-50 rounded text-red-600" aria-label="הסר"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שלב אוטומטי בסוף (לפי שירות + משך ידני)</label>
                <p className="text-xs text-[#64748B] mb-2">בחר שירות מהרשימה והזן משך בדקות (כמו follow-up ב single booking)</p>
                <div className="flex gap-2 mb-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) addAutoStep(v, 30);
                    }}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                  >
                    <option value="">הוסף שירות אוטומטי...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <ul className="space-y-1">
                  {comboForm.autoSteps.map((step, i) => {
                    const service = services.find((s) => s.id === step.serviceId);
                    return (
                      <li key={`auto-${step.serviceId}-${i}`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
                        <span className="text-sm font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">נוסף אוטומטית</span>
                          {service ? service.name : step.serviceId}
                          <span className="text-[#64748B]">(override</span>
                          <DurationMinutesStepper
                            value={step.durationMinutesOverride}
                            onChange={(n) => updateAutoStepDuration(i, n)}
                            min={15}
                            className="w-20 text-sm"
                          />
                          <span className="text-[#64748B]">דק׳)</span>
                        </span>
                        <button type="button" onClick={() => removeAutoStepAt(i)} className="p-1 hover:bg-red-50 rounded text-red-600" aria-label="הסר"><Trash2 className="w-4 h-4" /></button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="combo-active"
                  checked={comboForm.isActive}
                  onChange={(e) => setComboForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                <label htmlFor="combo-active" className="text-sm text-slate-700">כלל פעיל</label>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-4">
                <button type="button" onClick={closeComboModal} className="min-h-[44px] px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium touch-manipulation">ביטול</button>
                <button
                  type="button"
                  onClick={saveCombo}
                  disabled={!comboForm.name.trim() || comboForm.triggerServiceTypeIds.length === 0 || comboForm.orderedServiceTypeIds.length === 0}
                  className="min-h-[44px] px-4 py-2.5 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  שמור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Modal (create + edit) */}
      {editingService && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col mt-auto sm:mt-0">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">{isServiceCreateMode ? "הוסף שירות" : "ערוך שירות"}</h3>
              <button
                onClick={() => setEditingService(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 -m-2 hover:bg-slate-100 rounded-lg touch-manipulation"
                aria-label="סגור"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  שם השירות *
                </label>
                <input
                  type="text"
                  value={editingService.name}
                  onChange={(e) =>
                    setEditingService({ ...editingService, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  צבע השירות ביומן
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={editingService.color || "#3B82F6"}
                    onChange={(e) =>
                      setEditingService({ ...editingService, color: e.target.value })
                    }
                    className="w-16 h-10 border border-slate-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editingService.color || "#3B82F6"}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Validate hex color format
                      if (/^#[0-9A-Fa-f]{6}$/.test(value) || value === "") {
                        setEditingService({ ...editingService, color: value || "#3B82F6" });
                      }
                    }}
                    placeholder="#3B82F6"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  צבע זה יקבע איך השירות יופיע בלוח הזמנים (ביומן התורים).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תיאור קצר (לאתר)
                </label>
                <textarea
                  rows={2}
                  value={editingService.description ?? ""}
                  onChange={(e) =>
                    setEditingService({ ...editingService, description: e.target.value.trim() || undefined })
                  }
                  placeholder="תיאור אופציונלי לשירות..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep resize-none"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingService.enabled !== false}
                  onChange={(e) =>
                    setEditingService({ ...editingService, enabled: e.target.checked })
                  }
                  className="w-4 h-4 text-caleno-deep rounded focus:ring-caleno-deep"
                />
                <span className="text-sm text-slate-700">פעיל</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="min-h-[44px] px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium touch-manipulation"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleSaveService}
                  disabled={!editingService.name.trim() || isSavingService}
                  className="min-h-[44px] px-4 py-2.5 bg-caleno-ink hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium touch-manipulation"
                >
                  {isSavingService ? "שומר..." : "שמור"}
                </button>
              </div>
              {!isServiceCreateMode && (
                <button
                  type="button"
                  onClick={() => {
                    if (editingService && editingService.id !== "new") {
                      handleDeleteService(editingService.id);
                      setEditingService(null);
                    }
                  }}
                  className="min-h-[44px] px-4 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center justify-center gap-2 touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                  מחק שירות
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-t-2xl sm:rounded-3xl shadow-xl border border-[#E2E8F0] w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col mt-auto sm:mt-0">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {editingItem.id === "new" ? "הוסף פריט מחיר" : "ערוך פריט מחיר"}
              </h3>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setEditingItemParentService(null);
                  setFollowUpPriceInputValue("");
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 -m-2 hover:bg-slate-100 rounded-lg touch-manipulation"
                aria-label="סגור"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {/* Main service: read-only (same as the service you chose from), not changeable. */}
              {editingItemParentService ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שירות</label>
                  <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 text-right">
                    {editingItemParentService.name}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    שירות *
                  </label>
                  <select
                    value={editingItem.serviceId || editingItem.service || ""}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        serviceId: e.target.value,
                        service: e.target.value,
                      })
                    }
                    className={`w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep ${
                      !editingItem.serviceId && !editingItem.service ? "border-red-300" : "border-slate-300"
                    }`}
                    required
                  >
                    <option value="">בחר שירות</option>
                    {activeServiceIds.length === 0 ? (
                      <option value="" disabled>אין שירותים זמינים</option>
                    ) : (
                      activeServiceIds.map((serviceName) => (
                        <option key={serviceName} value={serviceName}>
                          {serviceName}
                        </option>
                      ))
                    )}
                  </select>
                  {!editingItem.serviceId && !editingItem.service && (
                    <p className="text-xs text-red-600 mt-1">בחר שירות</p>
                  )}
                  {activeServiceIds.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      הוסף שירות תחילה מהרשימה למעלה
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  סוג (אופציונלי)
                </label>
                <input
                  type="text"
                  value={editingItem.type || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, type: e.target.value || null })
                  }
                  placeholder="למשל: רבע ראש, חצי ראש"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  משך השירות (בדקות) *
                </label>
                <DurationMinutesStepper
                  value={editingItem.durationMinMinutes ?? editingItem.durationMaxMinutes ?? 30}
                  onChange={(n) => {
                    setEditingItem({
                      ...editingItem,
                      durationMinMinutes: n,
                      durationMaxMinutes: n,
                    });
                    setDurationInputValue(String(n));
                  }}
                  min={15}
                  className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {editingItem.hasFollowUp ? "מחיר שלב ראשון (טיפול ראשוני)" : "מחיר"}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceInputValue}
                  onChange={(e) => {
                    setPriceInputValue(e.target.value);
                    setError(null);
                  }}
                  onBlur={(e) => {
                    const inputValue = e.target.value.trim();
                    if (!inputValue) {
                      setEditingItem({
                        ...editingItem,
                        price: undefined,
                        priceRangeMin: undefined,
                        priceRangeMax: undefined,
                      });
                      setPriceInputValue("");
                      return;
                    }
                    
                    const parsed = parseNumberOrRange(inputValue);
                    if (parsed.kind === "single") {
                      setEditingItem({
                        ...editingItem,
                        price: parsed.value,
                        priceRangeMin: undefined,
                        priceRangeMax: undefined,
                      });
                      setPriceInputValue(`${parsed.value}`);
                      setError(null);
                    } else if (parsed.kind === "range") {
                      // Store range in priceRangeMin/priceRangeMax
                      setEditingItem({
                        ...editingItem,
                        price: undefined, // Clear single price when using range
                        priceRangeMin: parsed.min,
                        priceRangeMax: parsed.max,
                      });
                      setPriceInputValue(`${parsed.min}-${parsed.max}`);
                      setError(null);
                    } else if (parsed.kind === "invalid") {
                      setError(parsed.error || "מחיר חייב להיות מספר (למשל: 100) או טווח (למשל: 100-200)");
                      // Restore previous value
                      const prevPrice = editingItem.price ?? editingItem.priceRangeMin;
                      const prevPriceMax = editingItem.priceRangeMax;
                      setPriceInputValue(formatNumberOrRange(prevPrice, prevPriceMax));
                    }
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                />
                {editingItem.hasFollowUp ? (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 mt-1" dir="rtl">
                    <span className="font-medium text-slate-700">למה שני מחירים?</span> שלב ראשון ושלב המשך נרשמים כשני תורים (לעיתים עם שני מטפלים). מחיר שלב ראשון נספר לעובד שביצע את הטיפול הראשון; מחיר &quot;המשך טיפול&quot; נספר לעובד שביצע את השלב השני — כך ביצועי צוות משקפים נכון את ההכנסה לכל אחד.
                  </p>
                ) : null}
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                  שימו לב: מחיר שאינו מספר בודד (לדוגמה 50-100) ייחשב כ-0 בדוחות שכר. אלא אם יוגדר מחיר אישי לכל לקוח
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  הערות (אופציונלי)
                </label>
                <textarea
                  value={editingItem.notes || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, notes: e.target.value || undefined })
                  }
                  rows={3}
                  placeholder="הערות נוספות..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep resize-none"
                />
              </div>

              {/* Follow-up Service Section */}
              <div className="border-t border-slate-200 pt-4">
                <label className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    checked={editingItem.hasFollowUp || false}
                    onChange={(e) => {
                      const newHasFollowUp = e.target.checked;
                      const defaultFollowUp = { name: "", durationMinutes: 15, waitMinutes: 0, price: 0 as number };
                      setEditingItem({
                        ...editingItem,
                        hasFollowUp: newHasFollowUp,
                        followUp: newHasFollowUp
                          ? (editingItem.followUp
                              ? { ...editingItem.followUp, price: editingItem.followUp.price ?? 0 }
                              : defaultFollowUp)
                          : null,
                      });
                      if (!newHasFollowUp) {
                        setFollowUpNameInputValue("");
                        setFollowUpDurationInputValue("");
                        setFollowUpWaitInputValue("0");
                        setFollowUpTextInputValue("");
                        setFollowUpPriceInputValue("");
                      } else {
                        setFollowUpNameInputValue("");
                        setFollowUpPriceInputValue(
                          editingItem.followUp && typeof editingItem.followUp.price === "number"
                            ? String(editingItem.followUp.price)
                            : "0"
                        );
                      }
                      setError(null);
                    }}
                    className="w-4 h-4 text-caleno-deep rounded focus:ring-caleno-deep"
                  />
                  <span className="text-sm font-medium text-slate-700">המשך טיפול</span>
                </label>

                {editingItem.hasFollowUp && (
                  <div className="space-y-4 pr-6 bg-slate-50 p-4 rounded-lg">
                    {/* Follow-up service: always changeable, select from all services. */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        המשך שירות *
                      </label>
                      <select
                        value={editingItem.followUp?.name ?? followUpNameInputValue ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const svc = services.find((s) => s.name === v);
                          setFollowUpNameInputValue(v);
                          setEditingItem({
                            ...editingItem,
                            followUp: editingItem.followUp
                              ? { ...editingItem.followUp, name: v, serviceId: svc?.id }
                              : { name: v, serviceId: svc?.id, durationMinutes: 15, waitMinutes: 0 },
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep bg-white"
                      >
                        <option value="">בחר שירות...</option>
                        {(() => {
                          const currentName = (editingItem.followUp?.name ?? followUpNameInputValue ?? "").trim();
                          const inList = currentName && services.some((s) => s.name === currentName);
                          return (
                            <>
                              {currentName && !inList && (
                                <option value={currentName}>{currentName} (לא ברשימה)</option>
                              )}
                              {services.filter((s) => s.enabled !== false).map((s) => (
                                <option key={s.id} value={s.name}>
                                  {s.name}
                                </option>
                              ))}
                            </>
                          );
                        })()}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        מחיר שלב המשך (המשך טיפול) ₪
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={followUpPriceInputValue}
                        onChange={(e) => {
                          setFollowUpPriceInputValue(e.target.value);
                          setError(null);
                        }}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep bg-white"
                      />
                      <p className="text-xs text-slate-600 mt-1" dir="rtl">
                        סכום זה יוחס לעובד שמבצע את שלב 2 בלבד. סכום שלב 1 מוגדר בשדה &quot;מחיר שלב ראשון&quot; למעלה.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        משך שלב 2 (דקות) *
                      </label>
                      <DurationMinutesStepper
                        value={editingItem.followUp?.durationMinutes ?? 15}
                        onChange={(n) => {
                          setFollowUpDurationInputValue(String(n));
                          setEditingItem({
                            ...editingItem,
                            followUp: editingItem.followUp
                              ? { ...editingItem.followUp, durationMinutes: n }
                              : { name: followUpNameInputValue || "—", durationMinutes: n, waitMinutes: 0 },
                          });
                        }}
                        min={0}
                        className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        המתנה אחרי שלב 1 (דקות)
                      </label>
                      <DurationMinutesStepper
                        value={editingItem.followUp?.waitMinutes ?? 0}
                        onChange={(n) => {
                          setFollowUpWaitInputValue(String(n));
                          setEditingItem({
                            ...editingItem,
                            followUp: editingItem.followUp
                              ? { ...editingItem.followUp, waitMinutes: n }
                              : { name: followUpNameInputValue || "—", durationMinutes: 15, waitMinutes: n },
                          });
                        }}
                        min={0}
                        className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        הערות
                      </label>
                      <input
                        type="text"
                        value={editingItem.followUp?.text ?? followUpTextInputValue ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.slice(0, FOLLOWUP_TEXT_MAX_LENGTH);
                          setFollowUpTextInputValue(v);
                          setEditingItem({
                            ...editingItem,
                            followUp: editingItem.followUp
                              ? { ...editingItem.followUp, text: v.trim() || undefined }
                              : { name: followUpNameInputValue || "—", durationMinutes: 15, waitMinutes: 0, text: v.trim() || undefined },
                          });
                        }}
                        maxLength={FOLLOWUP_TEXT_MAX_LENGTH}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-caleno-deep bg-white"
                      />
                      <p className="text-xs text-[#64748B] mt-1" dir="rtl">
                        {(() => {
                          const serviceName = editingItemParentService?.name ?? editingItem.followUp?.name ?? followUpNameInputValue ?? "—";
                          const text = (editingItem.followUp?.text ?? followUpTextInputValue ?? "").trim();
                          const duration = editingItem.followUp?.durationMinutes ?? (followUpDurationInputValue ? parseInt(followUpDurationInputValue, 10) : 15);
                          const wait = editingItem.followUp?.waitMinutes ?? (followUpWaitInputValue ? parseInt(followUpWaitInputValue, 10) : 0);
                          const numDuration = Number.isFinite(duration) ? duration : 15;
                          const numWait = Number.isFinite(wait) ? wait : 0;
                          const preview = `המשך טיפול: ${serviceName}${text ? ` - ${text}` : ""} (${numDuration} דק׳)${numWait ? `, המתנה ${numWait} דק׳` : ""}`;
                          return (
                            <>
                              <span className="font-medium text-slate-600">תצוגה: </span>
                              {preview}
                              <span className="block mt-0.5 text-[#94A3B8]">מקסימום {FOLLOWUP_TEXT_MAX_LENGTH} תווים בשדה הטקסט.</span>
                            </>
                          );
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 bg-white border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col gap-2">
              {(() => {
                const serviceId = editingItem?.serviceId || editingItem?.service;
                const hasService = !!serviceId && serviceId.trim().length > 0;
                const hasValidDuration = editingItem?.durationMinMinutes !== undefined &&
                                         editingItem.durationMinMinutes !== null &&
                                         editingItem.durationMinMinutes >= 1;
                const hasFollowUp = editingItem?.hasFollowUp === true;
                const followUp = editingItem?.followUp;
                const hasValidFollowUp = !hasFollowUp ||
                                        (hasFollowUp &&
                                         !!followUp?.name?.trim() &&
                                         typeof followUp.durationMinutes === "number" && followUp.durationMinutes >= 1 &&
                                         typeof followUp.waitMinutes === "number" && followUp.waitMinutes >= 0);
                const isSaveDisabled = !hasService || !hasValidDuration || !hasValidFollowUp;
                return null;
              })()}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                  setEditingItem(null);
                  setEditingItemParentService(null);
                  setFollowUpPriceInputValue("");
                }}
                  className="min-h-[44px] px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium touch-manipulation"
                >
                  ביטול
                </button>
                {(() => {
                  const serviceId = editingItem?.serviceId || editingItem?.service;
                  const hasService = !!serviceId && serviceId.trim().length > 0;
                  const hasValidDuration = editingItem?.durationMinMinutes !== undefined &&
                                           editingItem.durationMinMinutes !== null &&
                                           editingItem.durationMinMinutes >= 1;
                  const hasFollowUp = editingItem?.hasFollowUp === true;
                  const followUp = editingItem?.followUp;
                  const hasValidFollowUp = !hasFollowUp ||
                                          (hasFollowUp &&
                                           !!followUp?.name?.trim() &&
                                           typeof followUp.durationMinutes === "number" && followUp.durationMinutes >= 1 &&
                                           typeof followUp.waitMinutes === "number" && followUp.waitMinutes >= 0);
                  const isSaveDisabled = !hasService || !hasValidDuration || !hasValidFollowUp;

                  const buttonClasses = isSaveDisabled
                    ? "min-h-[44px] px-4 py-2.5 bg-caleno-ink/60 text-white rounded-lg text-sm font-medium cursor-not-allowed opacity-75 touch-manipulation"
                    : "min-h-[44px] px-4 py-2.5 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium cursor-pointer opacity-100 transition-colors touch-manipulation";

                  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                    e.preventDefault();
                    const currentServiceId = editingItem?.serviceId || editingItem?.service;
                    const currentHasService = !!currentServiceId && currentServiceId.trim().length > 0;
                    const currentHasValidDuration = editingItem?.durationMinMinutes !== undefined &&
                                                    editingItem.durationMinMinutes !== null &&
                                                    editingItem.durationMinMinutes >= 1;
                    const currentHasFollowUp = editingItem?.hasFollowUp === true;
                    const currentFollowUp = editingItem?.followUp;
                    const currentHasValidFollowUp = !currentHasFollowUp ||
                                                    (currentHasFollowUp &&
                                                     !!currentFollowUp?.name?.trim() &&
                                                     typeof currentFollowUp.durationMinutes === "number" && currentFollowUp.durationMinutes >= 1 &&
                                                     typeof currentFollowUp.waitMinutes === "number" && currentFollowUp.waitMinutes >= 0);
                    const currentIsSaveDisabled = !currentHasService || !currentHasValidDuration || !currentHasValidFollowUp;

                    if (currentIsSaveDisabled) {
                      if (!currentHasService) {
                        setError("נא לבחור שירות");
                      } else if (!currentHasValidDuration) {
                        setError("משך השירות חייב להיות גדול או שווה ל-1 דקה");
                      } else {
                        setError("נא למלא את כל השדות הנדרשים");
                      }
                      return;
                    }
                    handleSaveItem();
                  };

                  return (
                    <button
                      key={`save-btn-${editingItem?.id ?? "new"}-${editingItem?.hasFollowUp ? "followup" : "no-followup"}`}
                      type="button"
                      onClick={handleClick}
                      aria-disabled={isSaveDisabled}
                      className={buttonClasses}
                    >
                      שמור
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New service reminder (info only, after successful create) */}
      {showNewServiceReminderModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[55] overflow-y-auto"
          dir="rtl"
          onClick={() => setShowNewServiceReminderModal(false)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-[#E2E8F0] w-full max-w-md p-4 sm:p-6 text-right my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base sm:text-lg font-semibold text-[#0F172A] mb-3">שים לב</h3>
            <p className="text-sm sm:text-base text-slate-900">
              זכור להגדיר זמינות לעובדים עבור השירות החדש, אחרת הוא לא יהיה זמין להזמנה.
            </p>
            <div className="mt-6 flex justify-start">
              <button
                type="button"
                onClick={() => setShowNewServiceReminderModal(false)}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-caleno-ink text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md touch-manipulation"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
      {typeof document !== "undefined" &&
        serviceMenuOpenId &&
        dropdownPosition &&
        (() => {
          const s = services.find((x) => x.id === serviceMenuOpenId);
          if (!s) return null;
          return createPortal(
            <div
              id="services-tab-dropdown-portal"
              className="fixed z-[9999]"
              style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
            >
              <div className="min-w-[160px] py-1 rounded-xl border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    handleEditService(s);
                    setServiceMenuOpenId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="w-4 h-4 shrink-0" />
                  ערוך שירות
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteService(s.id);
                    setServiceMenuOpenId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  מחק שירות
                </button>
              </div>
            </div>,
            document.body
          );
        })()}
      {typeof document !== "undefined" &&
        itemMenuOpenId &&
        itemMenuPosition &&
        (() => {
          const item = pricingItems.find((p) => p.id === itemMenuOpenId);
          if (!item) return null;
          return createPortal(
            <div
              id="services-item-dropdown-portal"
              className="fixed z-[9999]"
              style={{ top: itemMenuPosition.top, left: itemMenuPosition.left }}
            >
              <div className="min-w-[160px] py-1 rounded-xl border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    handleEditItem(item);
                    setItemMenuOpenId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="w-4 h-4 shrink-0" />
                  ערוך
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteItem(item.id);
                    setItemMenuOpenId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  מחק
                </button>
              </div>
            </div>,
            document.body
          );
        })()}
      </div>
    </div>
  );
}
