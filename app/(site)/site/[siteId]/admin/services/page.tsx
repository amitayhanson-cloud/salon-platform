"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { X, Plus, Pencil, Trash2 } from "lucide-react";
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
import { AccordionItem } from "@/components/admin/Accordion";
import MinutesNumberInput from "@/components/admin/MinutesNumberInput";
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


export default function ServicesPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { user } = useAuth();
  // siteId from URL is the site document ID (sites/{siteId})

  const [services, setServices] = useState<SiteService[]>([]);
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openServices, setOpenServices] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<PricingItem | null>(null);
  const [editingService, setEditingService] = useState<SiteService | null>(null);
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [durationInputValue, setDurationInputValue] = useState<string>("");
  const [priceInputValue, setPriceInputValue] = useState<string>("");
  const [followUpNameInputValue, setFollowUpNameInputValue] = useState<string>("");
  const [followUpDurationInputValue, setFollowUpDurationInputValue] = useState<string>("");
  const [followUpWaitInputValue, setFollowUpWaitInputValue] = useState<string>("0");

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
      // Only show enabled services, sorted by sortOrder then name
      const enabledServices = svcs
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

  // Get unassigned items (items without serviceId or items whose serviceId doesn't match any service)
  const unassignedItems = (() => {
    const itemsWithoutServiceId = itemsByService["__UNASSIGNED__"] || [];
    const itemsWithUnmatchedService = pricingItems.filter((item) => {
      const serviceId = item.serviceId || item.service;
      if (!serviceId) return false; // Already in __UNASSIGNED__
      // Check if serviceId doesn't match any existing service name
      return !services.some((s) => s.name === serviceId);
    });
    return [...itemsWithoutServiceId, ...itemsWithUnmatchedService];
  })();

  const handleAddItem = (serviceId: string) => {
    const newItem: Omit<PricingItem, "id" | "createdAt" | "updatedAt"> = {
      serviceId: serviceId,
      service: serviceId,
      durationMinMinutes: 30,
      durationMaxMinutes: 30,
      price: 0,
      order: itemsByService[serviceId]?.length || 0,
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
  };

  const handleEditItem = (item: PricingItem) => {
    const convertedItem = { ...item };
    setDurationInputValue(formatNumberOrRange(convertedItem.durationMinMinutes, convertedItem.durationMaxMinutes));
    setPriceInputValue(formatNumberOrRange(
      convertedItem.priceRangeMin ?? convertedItem.price,
      convertedItem.priceRangeMax
    ));
    setFollowUpNameInputValue(convertedItem.followUp?.name ?? "");
    setFollowUpDurationInputValue(convertedItem.followUp?.durationMinutes != null ? String(convertedItem.followUp.durationMinutes) : "");
    setFollowUpWaitInputValue(String(convertedItem.followUp?.waitMinutes ?? 0));
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
      const name = (editingItem.followUp?.name ?? followUpNameInputValue).trim();
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

      // Follow-up: hasFollowUp + followUp { name, durationMinutes, waitMinutes } | null
      const followUpName = (editingItem.followUp?.name ?? followUpNameInputValue).trim();
      const followUpDuration = editingItem.followUp?.durationMinutes ?? (followUpDurationInputValue ? parseInt(followUpDurationInputValue, 10) : NaN);
      const followUpWait = editingItem.followUp?.waitMinutes ?? (followUpWaitInputValue ? parseInt(followUpWaitInputValue, 10) : 0);
      if (editingItem.hasFollowUp && followUpName && Number.isFinite(followUpDuration) && followUpDuration >= 1 && Number.isFinite(followUpWait) && followUpWait >= 0) {
        itemData.hasFollowUp = true;
        itemData.followUp = {
          name: followUpName,
          ...(editingItem.followUp?.serviceId && { serviceId: editingItem.followUp.serviceId }),
          durationMinutes: followUpDuration,
          waitMinutes: followUpWait,
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
      if (editingItem.notes) {
        itemData.notes = editingItem.notes;
      }

      const cleanItemData = removeUndefined(itemData) as Record<string, unknown>;
      console.log("[Services] service doc saved fields:", { hasFollowUp: cleanItemData.hasFollowUp, followUp: cleanItemData.followUp });

      const deleteLegacyFollowUpFields = ["followUpServiceId", "followUpServiceRefId", "followUpDurationMinutes", "followUpWaitMinutes", "waitMinutes"];

      if (editingItem.id === "new") {
        await createPricingItem(siteId, cleanItemData as Omit<PricingItem, "id" | "createdAt" | "updatedAt">);
      } else {
        await updatePricingItem(siteId, editingItem.id, cleanItemData as Partial<Omit<PricingItem, "id" | "createdAt">> & Record<string, unknown>, { deleteFields: deleteLegacyFollowUpFields });
      }
      setEditingItem(null);
      setDurationInputValue("");
      setPriceInputValue("");
      setFollowUpNameInputValue("");
      setFollowUpDurationInputValue("");
      setFollowUpWaitInputValue("0");
    } catch (err) {
      console.error("Failed to save pricing item", err);
      setError("שגיאה בשמירת הפריט");
    }
  };

  const toggleService = (serviceId: string) => {
    setOpenServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  };

  const handleAddService = async () => {
    if (!newServiceName.trim() || !siteId) return;
    try {
      console.log(`[ServicesPage] Adding service: name="${newServiceName.trim()}", siteId="${siteId}"`);
      const serviceId = await addSiteService(siteId, {
        name: newServiceName.trim(),
        enabled: true,
        color: "#3B82F6", // Default blue color
      });
      console.log(`[ServicesPage] Service added successfully: id="${serviceId}", PATH=sites/${siteId}`);
      setNewServiceName("");
      setShowAddService(false);
    } catch (err) {
      console.error("Failed to create service", err);
      setError("שגיאה ביצירת שירות");
    }
  };

  const handleEditService = (service: SiteService) => {
    setEditingService(service);
  };

  const handleSaveService = async () => {
    if (!editingService || !editingService.name.trim() || !siteId) return;
    try {
      const updatedService = {
        ...editingService,
        name: editingService.name.trim(),
        enabled: editingService.enabled !== false,
        color: editingService.color || "#3B82F6",
        description: editingService.description?.trim() || undefined,
        price: editingService.price,
        duration: editingService.duration,
        imageUrl: editingService.imageUrl?.trim() || null,
      };
      
      // Update local state immediately for instant UI feedback
      setServices(prev => prev.map(s => s.id === updatedService.id ? updatedService : s));
      
      await updateSiteService(siteId, editingService.id, {
        name: updatedService.name,
        enabled: updatedService.enabled,
        color: updatedService.color,
        description: updatedService.description,
        price: updatedService.price,
        duration: updatedService.duration,
        imageUrl: updatedService.imageUrl ?? null,
      });
      
      setEditingService(null);
    } catch (err) {
      console.error("Failed to update service", err);
      setError("שגיאה בעדכון שירות");
      // Revert local state on error by re-fetching (subscription will handle this)
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service || !siteId) return;
    
    if (!confirm(`האם אתה בטוח שברצונך למחוק את השירות "${service.name}"? כל פריטי המחיר של שירות זה יימחקו.`)) return;
    
    try {
      // Delete all pricing items for this service
      const itemsToDelete = itemsByService[service.name] || [];
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 text-sm">טוען מחירים…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">שירותים</h1>
            <p className="text-sm text-slate-500 mt-1">
              ניהול שירותים ומחיריהם
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          {/* Unified Services and Pricing View */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">שירותים ומחירים</h2>
              <p className="text-sm text-slate-500 mt-1">
                ניהול שירותים וסוגי המחירים שלהם
              </p>
            </div>
            <button
              onClick={() => setShowAddService(true)}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              הוסף שירות
            </button>
          </div>

          {showAddService && (
            <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="שם השירות"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddService();
                    } else if (e.key === "Escape") {
                      setShowAddService(false);
                      setNewServiceName("");
                    }
                  }}
                />
                <button
                  onClick={handleAddService}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium"
                >
                  שמור
                </button>
                <button
                  onClick={() => {
                    setShowAddService(false);
                    setNewServiceName("");
                  }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}

          {/* Services with nested pricing items */}
          {services.length === 0 && unassignedItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4">אין שירותים עדיין</p>
              <p className="text-sm text-slate-400">
                לחץ על "הוסף שירות" כדי להתחיל
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Services with pricing items */}
              {services.map((service) => {
                const items = itemsByService[service.name] || [];
                const isOpen = openServices.has(service.name);

                return (
                  <AccordionItem
                    key={service.id}
                    title={
                      <div className="flex items-center justify-between w-full pr-2">
                        <span className="font-semibold text-slate-900">{service.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">
                            {items.length} סוגי מחיר
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditService(service);
                            }}
                            className="p-1.5 hover:bg-sky-50 rounded text-sky-600"
                            title="ערוך שירות"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteService(service.id);
                            }}
                            className="p-1.5 hover:bg-red-50 rounded text-red-600"
                            title="מחק שירות"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    }
                    isOpen={isOpen}
                    onToggle={() => toggleService(service.name)}
                  >
                    <div className="mb-4 flex justify-between items-center">
                      <span className="text-xs text-slate-500">
                        {items.length === 0 ? "אין סוגי מחיר עדיין" : `${items.length} סוגי מחיר`}
                      </span>
                      <button
                        onClick={() => handleAddItem(service.name)}
                        className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        הוסף סוג שירות / מחיר
                      </button>
                    </div>
                    <div className="space-y-4">
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">
                          אין סוגי מחיר בשירות זה. לחץ על "הוסף סוג שירות / מחיר" כדי להתחיל.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                  סוג
                                </th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                  משך (דקות)
                                </th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                  מחיר
                                </th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                  הערות
                                </th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                  פעולות
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item) => (
                                <tr
                                  key={item.id}
                                  className="border-b border-slate-100 hover:bg-slate-50"
                                >
                                  <td className="px-3 py-2 text-slate-600">
                                    {item.type || "-"}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">
                                    {item.durationMinMinutes === item.durationMaxMinutes
                                      ? `${item.durationMinMinutes}`
                                      : `${item.durationMinMinutes}-${item.durationMaxMinutes}`}
                                  </td>
                                  <td className="px-3 py-2 text-slate-900 font-medium">
                                    {formatPriceDisplay(item)}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 text-xs">
                                    <div className="space-y-1">
                                      {item.notes && <div>{item.notes}</div>}
                                      {item.hasFollowUp && item.followUp && (
                                        <div className="text-sky-600 font-medium">
                                          המשך טיפול: {item.followUp.name} ({item.followUp.durationMinutes} דק׳)
                                          {item.followUp.waitMinutes ? `, המתנה ${item.followUp.waitMinutes} דק׳` : ""}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2 justify-end">
                                      <button
                                        onClick={() => handleEditItem(item)}
                                        className="p-1.5 hover:bg-sky-50 rounded text-sky-600"
                                        title="ערוך"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-1.5 hover:bg-red-50 rounded text-red-600"
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
                    </div>
                  </AccordionItem>
                );
              })}

              {/* Unassigned pricing items */}
              {unassignedItems.length > 0 && (
                <AccordionItem
                  key="__UNASSIGNED__"
                  title={
                    <div className="flex items-center justify-between w-full pr-2">
                      <span className="font-semibold text-slate-900">לא משויך</span>
                      <span className="text-xs text-slate-500">
                        {unassignedItems.length} פריטים
                      </span>
                    </div>
                  }
                  isOpen={openServices.has("__UNASSIGNED__")}
                  onToggle={() => toggleService("__UNASSIGNED__")}
                >
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-3">
                      פריטי מחיר שלא משויכים לשירות. בחר שירות כדי לשייך אותם.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">
                              שירות
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">
                              סוג
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">
                              משך (דקות)
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">
                              מחיר
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">
                              פעולות
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {unassignedItems.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b border-slate-100 hover:bg-slate-50"
                            >
                              <td className="px-3 py-2 text-slate-600">
                                {item.serviceId || item.service || "-"}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {item.type || "-"}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {item.durationMinMinutes === item.durationMaxMinutes
                                  ? `${item.durationMinMinutes}`
                                  : `${item.durationMinMinutes}-${item.durationMaxMinutes}`}
                              </td>
                              <td className="px-3 py-2 text-slate-900 font-medium">
                                {formatPriceDisplay(item)}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => handleEditItem(item)}
                                    className="p-1.5 hover:bg-sky-50 rounded text-sky-600"
                                    title="ערוך ושייך לשירות"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-1.5 hover:bg-red-50 rounded text-red-600"
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
                  </div>
                </AccordionItem>
              )}
            </div>
          )}
        </div>

        {/* Multi-Booking Combos */}
        <div className="mt-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">כללי Multi-Booking (קומבו)</h2>
              <p className="text-sm text-slate-500 mt-1">
                אם הלקוח בוחר סוגי שירותים (מחירון) → מתזמן לפי הסדר + משך והמתנה כמו ב follow-up
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenCombos((v) => !v)}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
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
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  הוסף קומבו
                </button>
              </div>
              {combos.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">אין קומבו. לחץ על &quot;הוסף קומבו&quot; כדי ליצור.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">שם</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">אם בוחרים</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">מתזמן בסדר</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">פעיל</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combos.map((combo) => (
                        <tr key={combo.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-900">{combo.name}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {combo.triggerServiceTypeIds.map((typeId) => {
                            const p = getPricingItemById(typeId);
                            return p ? getServiceTypeLabel(p) : typeId;
                          }).join(", ")}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {combo.orderedServiceTypeIds.map((typeId) => {
                              const p = getPricingItemById(typeId);
                              return p ? getServiceTypeLabel(p) : typeId;
                            }).join(" → ")}
                          </td>
                          <td className="px-3 py-2">{combo.isActive ? "כן" : "לא"}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => openComboEdit(combo)}
                                className="p-1.5 hover:bg-sky-50 rounded text-sky-600"
                                title="ערוך"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCombo(combo)}
                                className="p-1.5 hover:bg-red-50 rounded text-red-600"
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
      </div>

      {/* Combo Create/Edit Modal — rule builder: trigger set + ordered sequence */}
      {comboModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                {comboModal.type === "create" ? "הוסף כלל Multi-Booking" : "ערוך כלל"}
              </h3>
              <button type="button" onClick={closeComboModal} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם הכלל *</label>
                <input
                  type="text"
                  value={comboForm.name}
                  onChange={(e) => setComboForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 mb-2"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 mb-2"
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
                          <span className="mr-2 text-xs text-slate-500">({durationMin} דק׳ {waitMin > 0 ? `+ המתנה ${waitMin} דק׳` : ""})</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveOrderedServiceType(i, "up")} disabled={i === 0} className="p-1 rounded text-slate-500 disabled:opacity-40" aria-label="למעלה">↑</button>
                          <button type="button" onClick={() => moveOrderedServiceType(i, "down")} disabled={i === comboForm.orderedServiceTypeIds.length - 1} className="p-1 rounded text-slate-500 disabled:opacity-40" aria-label="למטה">↓</button>
                          <button type="button" onClick={() => removeOrderedServiceTypeAt(i)} className="p-1 hover:bg-red-50 rounded text-red-600" aria-label="הסר"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שלב אוטומטי בסוף (לפי שירות + משך ידני)</label>
                <p className="text-xs text-slate-500 mb-2">בחר שירות מהרשימה והזן משך בדקות (כמו follow-up ב single booking)</p>
                <div className="flex gap-2 mb-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) addAutoStep(v, 30);
                    }}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                          <span className="text-slate-500">(override</span>
                          <input
                            type="number"
                            min={1}
                            value={step.durationMinutesOverride}
                            onChange={(e) => updateAutoStepDuration(i, parseInt(e.target.value, 10) || 1)}
                            className="w-14 px-1 py-0.5 border border-slate-300 rounded text-right text-sm"
                          />
                          <span className="text-slate-500">דק׳)</span>
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
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={closeComboModal} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">ביטול</button>
                <button
                  type="button"
                  onClick={saveCombo}
                  disabled={!comboForm.name.trim() || comboForm.triggerServiceTypeIds.length === 0 || comboForm.orderedServiceTypeIds.length === 0}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  שמור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">ערוך שירות</h3>
              <button
                onClick={() => setEditingService(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  צבע השירות
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
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  הצבע שיוצג בלוח התורים עבור שירות זה
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    מחיר התחלתי (₪)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editingService.price ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? undefined : parseInt(v, 10);
                      const validPrice =
                        typeof n === "number" && Number.isFinite(n) ? n : undefined;
                      setEditingService({
                        ...editingService,
                        price: v === "" ? undefined : (validPrice ?? editingService.price),
                      });
                    }}
                    placeholder="—"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    משך (דקות)
                  </label>
                  <MinutesNumberInput
                    value={editingService.duration ?? 15}
                    onChange={(n) => setEditingService({ ...editingService, duration: n })}
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 -mt-1">
                אופציונלי. יוצגו בכרטיס השירות באתר.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תמונת שירות (כתובת URL)
                </label>
                <input
                  type="url"
                  value={editingService.imageUrl ?? ""}
                  onChange={(e) =>
                    setEditingService({ ...editingService, imageUrl: e.target.value.trim() || undefined })
                  }
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  אופציונלי. תוצג ברשת השירותים באתר
                </p>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingService.enabled !== false}
                  onChange={(e) =>
                    setEditingService({ ...editingService, enabled: e.target.checked })
                  }
                  className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                />
                <span className="text-sm text-slate-700">פעיל</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setEditingService(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveService}
                disabled={!editingService.name.trim()}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem.id === "new" ? "הוסף פריט מחיר" : "ערוך פריט מחיר"}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
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
                      service: e.target.value, // Set service for backward compatibility
                    })
                  }
                  className={`w-full px-3 py-2 border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 ${
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  משך השירות (בדקות) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationInputValue}
                  onChange={(e) => {
                    // Allow typing freely - store raw input
                    setDurationInputValue(e.target.value);
                    // Clear error while typing
                    setError(null);
                  }}
                  onBlur={(e) => {
                    const inputValue = e.target.value.trim();
                    // Parse the input: single number or range
                    const rangeMatch = inputValue.match(/^(\d+)\s*-\s*(\d+)$/);
                    const singleMatch = inputValue.match(/^(\d+)$/);
                    
                    if (rangeMatch) {
                      // Range format: "30-60"
                      const min = parseInt(rangeMatch[1], 10);
                      const max = parseInt(rangeMatch[2], 10);
                      if (min >= 1 && max > min) {
                        setEditingItem({
                          ...editingItem,
                          durationMinMinutes: min,
                          durationMaxMinutes: max,
                        });
                        setDurationInputValue(`${min}-${max}`);
                        setError(null);
                      } else {
                        // Invalid range
                        setError("טווח לא תקין: הערך המינימלי חייב להיות קטן מהמקסימלי");
                        // Restore previous valid value
                        if (editingItem?.durationMinMinutes && editingItem?.durationMaxMinutes) {
                          if (editingItem.durationMinMinutes === editingItem.durationMaxMinutes) {
                            setDurationInputValue(`${editingItem.durationMinMinutes}`);
                          } else {
                            setDurationInputValue(`${editingItem.durationMinMinutes}-${editingItem.durationMaxMinutes}`);
                          }
                        }
                      }
                    } else if (singleMatch) {
                      // Single number: "30"
                      const value = parseInt(singleMatch[1], 10);
                      if (value >= 1) {
                        setEditingItem({
                          ...editingItem,
                          durationMinMinutes: value,
                          durationMaxMinutes: value,
                        });
                        setDurationInputValue(`${value}`);
                        setError(null);
                      } else {
                        setError("משך השירות חייב להיות גדול או שווה ל-1 דקה");
                        // Restore previous valid value
                        if (editingItem?.durationMinMinutes) {
                          setDurationInputValue(`${editingItem.durationMinMinutes}`);
                        }
                      }
                    } else if (inputValue === "") {
                      // Empty - validation will catch it on save
                      setError(null);
                    } else {
                      // Invalid format
                      setError("פורמט לא תקין: השתמש במספר (למשל: 30) או טווח (למשל: 30-60)");
                      // Restore previous valid value
                      if (editingItem?.durationMinMinutes && editingItem?.durationMaxMinutes) {
                        if (editingItem.durationMinMinutes === editingItem.durationMaxMinutes) {
                          setDurationInputValue(`${editingItem.durationMinMinutes}`);
                        } else {
                          setDurationInputValue(`${editingItem.durationMinMinutes}-${editingItem.durationMaxMinutes}`);
                        }
                      }
                    }
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  מחיר
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
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
                      setEditingItem({
                        ...editingItem,
                        hasFollowUp: newHasFollowUp,
                        followUp: newHasFollowUp
                          ? (editingItem.followUp ?? { name: "", durationMinutes: 15, waitMinutes: 0 })
                          : null,
                      });
                      if (!newHasFollowUp) {
                        setFollowUpNameInputValue("");
                        setFollowUpDurationInputValue("");
                        setFollowUpWaitInputValue("0");
                      }
                      setError(null);
                    }}
                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                  />
                  <span className="text-sm font-medium text-slate-700">המשך טיפול</span>
                </label>

                {editingItem.hasFollowUp && (
                  <div className="space-y-4 pr-6 bg-slate-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        שלב 2 – שירות *
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
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
                              {services.map((s) => (
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
                        משך שלב 2 (דקות) *
                      </label>
                      <MinutesNumberInput
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        המתנה אחרי שלב 1 (דקות)
                      </label>
                      <MinutesNumberInput
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
              >
                ביטול
              </button>
              {(() => {
                // Single source of truth for disabled state - computed from current editingItem
                // This IIFE runs on every render, so it always uses the latest editingItem state
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
                
                // Debug logging (dev only) - log after toggle to verify state updates
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Save Button Debug]', {
                    serviceId,
                    hasService,
                    durationMinMinutes: editingItem?.durationMinMinutes,
                    hasValidDuration,
                    hasFollowUp,
                    followUp: editingItem?.followUp,
                    hasValidFollowUp,
                    isSaveDisabled,
                    editingItemState: editingItem ? 'exists' : 'null',
                    timestamp: Date.now(),
                  });
                }
                
                // Explicit button classes - no conditional logic in className
                const buttonClasses = isSaveDisabled
                  ? "px-4 py-2 bg-sky-300 text-white rounded-lg text-sm font-medium cursor-not-allowed opacity-75"
                  : "px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium cursor-pointer opacity-100 transition-colors";
                
                // Create a safe click handler that double-checks disabled state using current editingItem
                const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                  // Re-check disabled state at click time to prevent stale closures
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
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  handleSaveItem();
                };
                
                return (
                  <button
                    key={`save-btn-${editingItem?.id || 'new'}-${editingItem?.hasFollowUp ? 'followup' : 'no-followup'}`}
                    type="button"
                    onClick={handleClick}
                    disabled={isSaveDisabled}
                    className={buttonClasses}
                    style={{
                      pointerEvents: isSaveDisabled ? 'none' : 'auto',
                      cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
                    }}
                    aria-disabled={isSaveDisabled}
                  >
                    שמור
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
