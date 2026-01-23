"use client";

import { useEffect, useState, useRef } from "react";
import { X, Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
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
import AdminTabs from "@/components/ui/AdminTabs";
import { parseNumberOrRange, formatNumberOrRange } from "@/lib/parseNumberOrRange";
import { formatPriceDisplay } from "@/lib/formatPrice";


export default function ServicesPage() {
  const { user, authReady } = useAuth();
  const userId = user?.id;

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
  const [waitTimeInputValue, setWaitTimeInputValue] = useState<string>("");
  const [priceInputValue, setPriceInputValue] = useState<string>("");
  const [followUpDurationInputValue, setFollowUpDurationInputValue] = useState<string>("");
  
  // Tab state for services page
  type ServicesTabType = "services" | "pricing";
  const [activeTab, setActiveTab] = useState<ServicesTabType>("services");

  // Track first load to set loading state only once
  const didFirstLoad = useRef(false);
  const previousServicesRef = useRef<SiteService[]>([]);
  const previousPricingItemsRef = useRef<PricingItem[]>([]);

  // Load services and pricing items
  useEffect(() => {
    if (!userId) return;

    // Reset first load flag when userId changes
    didFirstLoad.current = false;
    previousServicesRef.current = [];
    previousPricingItemsRef.current = [];
    setLoading(true);
    
    // Run migration on first load
    migrateServicesFromSubcollection(userId).catch((err) => {
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
      userId,
      handleServicesUpdate,
      handleServicesError
    );

    const unsubscribeItems = subscribePricingItems(
      userId,
      handlePricingItemsUpdate,
      handlePricingItemsError
    );

    return () => {
      unsubscribeServices();
      unsubscribeItems();
    };
  }, [userId]);

  // Get active service IDs for dropdowns
  const activeServiceIds = services.map((s) => s.name).sort();

  // Group items by serviceId (with backward compatibility)
  const itemsByService = pricingItems.reduce((acc, item) => {
    // Use serviceId if available, fallback to service for backward compatibility
    const serviceId = item.serviceId || item.service;
    if (!serviceId) {
      console.warn("[Pricing] Item missing serviceId/service, skipping:", item.id);
      return acc;
    }
    if (!acc[serviceId]) {
      acc[serviceId] = [];
    }
    acc[serviceId].push(item);
    return acc;
  }, {} as Record<string, PricingItem[]>);

  // Get all service IDs that have pricing items or exist in services collection
  const allServiceIds = Array.from(
    new Set([
      ...services.map((s) => s.name),
      ...pricingItems.map((i) => i.serviceId || i.service).filter((s): s is string => !!s),
    ])
  ).sort();

  const handleAddItem = (serviceId: string) => {
    const newItem: Omit<PricingItem, "id" | "createdAt" | "updatedAt"> = {
      serviceId: serviceId,
      service: serviceId, // Set service for backward compatibility
      durationMinMinutes: 30,
      durationMaxMinutes: 30,
      waitMinutes: 0,
      price: 0,
      order: itemsByService[serviceId]?.length || 0,
      hasFollowUp: false,
      followUpServiceId: null,
      followUpDurationMinutes: null,
      followUpWaitMinutes: null, // Deprecated - kept for backwards compatibility
    };
    setEditingItem({
      ...newItem,
      id: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Initialize all input values with defaults
    setDurationInputValue("30");
    setWaitTimeInputValue("0");
    setPriceInputValue("0");
    setFollowUpDurationInputValue("");
  };

  const handleEditItem = (item: PricingItem) => {
    // Convert range values to single values for backwards compatibility
    const convertedItem = { ...item };
    
    // Keep price ranges as-is - no conversion needed
    
    // Convert waiting time range to single: prefer min, else max, else existing waitMinutes
    if (convertedItem.waitTimeMin !== undefined || convertedItem.waitTimeMax !== undefined) {
      convertedItem.waitMinutes = convertedItem.waitTimeMin ?? convertedItem.waitTimeMax ?? convertedItem.waitMinutes ?? undefined;
      convertedItem.waitTimeMin = undefined;
      convertedItem.waitTimeMax = undefined;
    }
    
    // Initialize all input values for display
    setDurationInputValue(formatNumberOrRange(convertedItem.durationMinMinutes, convertedItem.durationMaxMinutes));
    setWaitTimeInputValue(formatNumberOrRange(convertedItem.waitMinutes));
    // Format price: use range if available, otherwise single price
    setPriceInputValue(formatNumberOrRange(
      convertedItem.priceRangeMin ?? convertedItem.price,
      convertedItem.priceRangeMax
    ));
    setFollowUpDurationInputValue(formatNumberOrRange(convertedItem.followUpDurationMinutes));
    
    setEditingItem(convertedItem);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את הפריט?")) return;
    
    const uid = userId;
    if (!uid) {
      setError("יש להתחבר מחדש");
      return;
    }
    
    try {
      await deletePricingItem(uid, itemId);
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

    // Validation
    const serviceId = editingItem.serviceId || editingItem.service;
    if (!serviceId || !serviceId.trim()) {
      setError("בחר שירות");
      return;
    }
    // Early validation guard - prevent saving if button should be disabled
    if (!editingItem.durationMinMinutes || editingItem.durationMinMinutes < 1) {
      setError("משך השירות חייב להיות גדול או שווה ל-1 דקה");
      return;
    }
    // Validate waiting time: must be >= 0 if provided
    if (editingItem.waitMinutes !== undefined && editingItem.waitMinutes !== null && editingItem.waitMinutes < 0) {
      setError("זמן המתנה חייב להיות גדול או שווה ל-0");
      return;
    }
    if (editingItem.hasFollowUp) {
      if (!editingItem.followUpServiceId || !editingItem.followUpDurationMinutes || editingItem.followUpDurationMinutes < 1) {
        setError("שירות המשך ומשך המשך נדרשים כאשר המשך טיפול מופעל");
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

      // Optional fields - use null instead of undefined
      if (editingItem.type !== undefined && editingItem.type !== null && editingItem.type.trim()) {
        itemData.type = editingItem.type;
      } else {
        itemData.type = null; // Explicitly set to null if empty
      }
      // Handle waiting time: single value only
      if (editingItem.waitMinutes !== undefined && editingItem.waitMinutes !== null) {
        itemData.waitMinutes = editingItem.waitMinutes;
      }
      // Clear range fields for backwards compatibility
      itemData.waitTimeMin = undefined;
      itemData.waitTimeMax = undefined;
      
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

      // Follow-up fields - only include if hasFollowUp is true, use null for empty
      if (editingItem.hasFollowUp) {
        itemData.followUpServiceId = editingItem.followUpServiceId || null;
        itemData.followUpDurationMinutes = editingItem.followUpDurationMinutes || null;
        itemData.followUpWaitMinutes = null; // Deprecated - always set to null for backwards compatibility
      } else {
        // Explicitly set to null when disabled
        itemData.followUpServiceId = null;
        itemData.followUpDurationMinutes = null;
        itemData.followUpWaitMinutes = null; // Deprecated - always set to null
      }

      // Remove any undefined values that might have slipped through
      const cleanItemData = removeUndefined(itemData);

      // Console logging for debugging
      console.log("[Pricing] Saving item with payload:", cleanItemData);
      console.log("[Pricing] serviceId value:", cleanItemData.serviceId);
      console.log("[Pricing] hasFollowUp:", cleanItemData.hasFollowUp);
      console.log("[Pricing] followUpServiceId:", cleanItemData.followUpServiceId);

      const uid = userId;
      if (!uid) {
        setError("יש להתחבר מחדש");
        return;
      }
      
      if (editingItem.id === "new") {
        await createPricingItem(uid, cleanItemData);
      } else {
        await updatePricingItem(uid, editingItem.id, cleanItemData);
      }
      setEditingItem(null);
      setDurationInputValue("");
      setWaitTimeInputValue("");
      setPriceInputValue("");
      setFollowUpDurationInputValue("");
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
    if (!newServiceName.trim()) return;
    
    const uid = userId;
    if (!uid) {
      setError("יש להתחבר מחדש");
      return;
    }
    
    try {
      await addSiteService(uid, {
        name: newServiceName.trim(),
        enabled: true,
      });
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
    if (!editingService || !editingService.name.trim()) return;
    
    const uid = userId;
    if (!uid) {
      setError("יש להתחבר מחדש");
      return;
    }
    
    try {
      await updateSiteService(uid, editingService.id, {
        name: editingService.name.trim(),
        enabled: editingService.enabled !== false,
      });
      setEditingService(null);
    } catch (err) {
      console.error("Failed to update service", err);
      setError("שגיאה בעדכון שירות");
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    
    const uid = userId;
    if (!uid) {
      setError("יש להתחבר מחדש");
      return;
    }
    
    if (!confirm(`האם אתה בטוח שברצונך למחוק את השירות "${service.name}"? כל פריטי המחיר של שירות זה יימחקו.`)) return;
    
    try {
      // Delete all pricing items for this service
      const itemsToDelete = itemsByService[service.name] || [];
      await Promise.all(itemsToDelete.map((item) => deletePricingItem(uid, item.id)));
      
      // Delete service
      await deleteSiteService(uid, serviceId);
    } catch (err) {
      console.error("Failed to delete service", err);
      setError("שגיאה במחיקת שירות");
    }
  };

  // Wait for auth to be ready before rendering
  if (!authReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 text-sm">טוען מחירים…</p>
      </div>
    );
  }
  
  // If no user after auth is ready, show error
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-900 font-semibold mb-2">יש להתחבר מחדש</p>
          <p className="text-sm text-slate-600">נדרשת התחברות כדי לגשת לדף זה</p>
        </div>
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
          <AdminTabs
            tabs={[
              { key: "services", label: "שירותים" },
              { key: "pricing", label: "מחירים" },
            ]}
            activeKey={activeTab}
            onChange={setActiveTab}
          />

          {/* Tab Content */}
          <div>
            {/* Services Tab */}
            {activeTab === "services" && (
              <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900">שירותים</h2>
            <button
              onClick={() => setShowAddService(true)}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              הוסף שירות
            </button>
          </div>

          {showAddService && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
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

          {services.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-4">אין שירותים עדיין</p>
              <p className="text-sm text-slate-400">
                לחץ על "הוסף שירות" כדי להתחיל
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-900">{service.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditService(service)}
                      className="p-1.5 hover:bg-sky-50 rounded text-sky-600"
                      title="ערוך"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteService(service.id)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-600"
                      title="מחק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
              </div>
            )}

            {/* Pricing Tab */}
            {activeTab === "pricing" && (
              <div>
          {activeServiceIds.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4">אין פריטי מחיר עדיין</p>
              <p className="text-sm text-slate-400">
                בחר שירות מהרשימה למעלה כדי להוסיף פריט מחיר
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allServiceIds.map((serviceId) => {
                const items = itemsByService[serviceId] || [];
                const isOpen = openServices.has(serviceId);

                return (
                  <AccordionItem
                    key={serviceId}
                    title={serviceId}
                    isOpen={isOpen}
                    onToggle={() => toggleService(serviceId)}
                  >
                    <div className="mb-4 flex justify-between items-center">
                      <span className="text-xs text-slate-500">
                        {items.length} פריטים
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddItem(serviceId)}
                          className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          הוסף פריט
                        </button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">
                          אין פריטים בשירות זה
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
                                  המתנה (דקות)
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
                                  <td className="px-3 py-2 text-slate-600">
                                    {/* Backwards compatibility: convert range to single for display */}
                                    {(() => {
                                      const waitTime = item.waitMinutes ?? item.waitTimeMin ?? item.waitTimeMax;
                                      return waitTime !== undefined && waitTime !== null ? `${waitTime}` : "-";
                                    })()}
                                  </td>
                                  <td className="px-3 py-2 text-slate-900 font-medium">
                                    {formatPriceDisplay(item)}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 text-xs">
                                    <div className="space-y-1">
                                      {item.notes && <div>{item.notes}</div>}
                                      {item.hasFollowUp && item.followUpServiceId && item.followUpDurationMinutes && (
                                        <div className="text-sky-600 font-medium">
                                          המשך טיפול: {item.followUpServiceId} ({item.followUpDurationMinutes} דק׳)
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
            </div>
          )}
              </div>
            )}
          </div>
        </div>
      </div>

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
                  זמן המתנה (דקות)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={waitTimeInputValue}
                  onChange={(e) => {
                    setWaitTimeInputValue(e.target.value);
                    setError(null);
                  }}
                  onBlur={(e) => {
                    const inputValue = e.target.value.trim();
                    if (!inputValue) {
                      setEditingItem({
                        ...editingItem,
                        waitMinutes: undefined,
                      });
                      setWaitTimeInputValue("");
                      return;
                    }
                    
                    const parsed = parseNumberOrRange(inputValue);
                    if (parsed.kind === "single") {
                      setEditingItem({
                        ...editingItem,
                        waitMinutes: parsed.value,
                      });
                      setWaitTimeInputValue(`${parsed.value}`);
                      setError(null);
                    } else if (parsed.kind === "range") {
                      // For waiting time, store as single (use min) but display range
                      setEditingItem({
                        ...editingItem,
                        waitMinutes: parsed.min,
                      });
                      setWaitTimeInputValue(`${parsed.min}-${parsed.max}`);
                      setError(null);
                    } else if (parsed.kind === "invalid") {
                      setError(parsed.error || "פורמט לא תקין");
                      // Restore previous value
                      setWaitTimeInputValue(formatNumberOrRange(editingItem.waitMinutes));
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
                      const updatedItem = {
                        ...editingItem,
                        hasFollowUp: newHasFollowUp,
                        followUpServiceId: null, // Reset to null when toggled
                        followUpDurationMinutes: null,
                        followUpWaitMinutes: null,
                      };
                      
                      // Debug logging (dev only)
                      if (process.env.NODE_ENV === 'development') {
                        console.log('[Follow-up Toggle]', {
                          newHasFollowUp,
                          followUpServiceId: updatedItem.followUpServiceId,
                          followUpDurationMinutes: updatedItem.followUpDurationMinutes,
                          beforeUpdate: {
                            hasFollowUp: editingItem?.hasFollowUp,
                            followUpServiceId: editingItem?.followUpServiceId,
                            followUpDurationMinutes: editingItem?.followUpDurationMinutes,
                          },
                        });
                      }
                      
                      // Update state immediately
                      setEditingItem(updatedItem);
                      // Also reset input values
                      if (!newHasFollowUp) {
                        setFollowUpDurationInputValue("");
                      }
                      
                      // Force immediate re-render by clearing any error state
                      // This ensures the Save button state is recalculated immediately
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
                        שירות המשך *
                      </label>
                      <select
                        value={editingItem.followUpServiceId || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            followUpServiceId: e.target.value || null,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="">בחר שירות</option>
                        {activeServiceIds.map((serviceName) => (
                          <option key={serviceName} value={serviceName}>
                            {serviceName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        משך המשך (דקות) *
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={followUpDurationInputValue}
                        onChange={(e) => {
                          setFollowUpDurationInputValue(e.target.value);
                          setError(null);
                        }}
                        onBlur={(e) => {
                          const inputValue = e.target.value.trim();
                          if (!inputValue) {
                            setEditingItem({
                              ...editingItem,
                              followUpDurationMinutes: null,
                            });
                            setFollowUpDurationInputValue("");
                            return;
                          }
                          
                          const parsed = parseNumberOrRange(inputValue);
                          if (parsed.kind === "single" && parsed.value >= 1) {
                            setEditingItem({
                              ...editingItem,
                              followUpDurationMinutes: parsed.value,
                            });
                            setFollowUpDurationInputValue(`${parsed.value}`);
                            setError(null);
                          } else if (parsed.kind === "range" && parsed.min >= 1) {
                            // Store as single (use min) but display range
                            setEditingItem({
                              ...editingItem,
                              followUpDurationMinutes: parsed.min,
                            });
                            setFollowUpDurationInputValue(`${parsed.min}-${parsed.max}`);
                            setError(null);
                          } else if (parsed.kind === "invalid") {
                            setError(parsed.error || "משך המשך חייב להיות גדול או שווה ל-1 דקה");
                            // Restore previous value
                            setFollowUpDurationInputValue(formatNumberOrRange(editingItem.followUpDurationMinutes));
                          } else {
                            // Handle case where parsed.kind is "single" or "range" but validation fails (value < 1)
                            setError("משך המשך חייב להיות גדול או שווה ל-1 דקה");
                            // Restore previous value
                            setFollowUpDurationInputValue(formatNumberOrRange(editingItem.followUpDurationMinutes));
                          }
                        }}
                        placeholder="0"
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
                
                // Follow-up validation: if hasFollowUp is true, all follow-up fields must be valid
                const hasFollowUp = editingItem?.hasFollowUp === true;
                const hasValidFollowUp = !hasFollowUp || 
                                        (hasFollowUp &&
                                         !!editingItem.followUpServiceId &&
                                         editingItem.followUpServiceId.trim().length > 0 &&
                                         editingItem.followUpDurationMinutes !== undefined &&
                                         editingItem.followUpDurationMinutes !== null &&
                                         editingItem.followUpDurationMinutes >= 1);
                
                const isSaveDisabled = !hasService || !hasValidDuration || !hasValidFollowUp;
                
                // Debug logging (dev only) - log after toggle to verify state updates
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Save Button Debug]', {
                    serviceId,
                    hasService,
                    durationMinMinutes: editingItem?.durationMinMinutes,
                    hasValidDuration,
                    hasFollowUp,
                    followUpServiceId: editingItem?.followUpServiceId,
                    followUpDurationMinutes: editingItem?.followUpDurationMinutes,
                    hasValidFollowUp,
                    isSaveDisabled,
                    editingItemState: editingItem ? 'exists' : 'null',
                    timestamp: Date.now(), // Add timestamp to track render order
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
                  const currentHasValidFollowUp = !currentHasFollowUp || 
                                                  (currentHasFollowUp &&
                                                   !!editingItem.followUpServiceId &&
                                                   editingItem.followUpServiceId.trim().length > 0 &&
                                                   editingItem.followUpDurationMinutes !== undefined &&
                                                   editingItem.followUpDurationMinutes !== null &&
                                                   editingItem.followUpDurationMinutes >= 1);
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
