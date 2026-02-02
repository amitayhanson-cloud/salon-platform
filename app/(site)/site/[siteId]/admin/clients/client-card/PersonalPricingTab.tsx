"use client";

import { useEffect, useState, useMemo } from "react";
import { getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { clientDocRef } from "@/lib/firestoreClientRefs";
import { subscribeSiteServices } from "@/lib/firestoreSiteServices";
import { subscribePricingItems } from "@/lib/firestorePricing";
import {
  subscribePersonalPricing,
  removePersonalPricing,
  type PersonalPricing,
} from "@/lib/firestorePersonalPricing";
import type { SiteService } from "@/types/siteConfig";
import type { PricingItem } from "@/types/pricingItem";
import { AccordionItem } from "@/components/admin/Accordion";
import { Save, X, Loader2 } from "lucide-react";

interface PersonalPricingTabProps {
  siteId: string;
  phone: string; // phone number (document ID)
}

export default function PersonalPricingTab({
  siteId,
  phone,
}: PersonalPricingTabProps) {
  const [services, setServices] = useState<SiteService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  // personalPricing is a simple map: { [serviceTypeId]: number }
  const [personalPricing, setPersonalPricing] = useState<Record<string, number>>({});
  const [pricingLoading, setPricingLoading] = useState(true);
  const [openServices, setOpenServices] = useState<Set<string>>(new Set());
  
  // Local state for editing prices (serviceTypeId -> price string)
  const [editingPrices, setEditingPrices] = useState<Map<string, string>>(new Map());
  const [savingServiceTypeId, setSavingServiceTypeId] = useState<string | null>(null);
  const [resettingServiceTypeId, setResettingServiceTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load services
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribeSiteServices(
      siteId,
      (svcs) => {
        const enabledServices = svcs
          .filter((s) => s.enabled !== false)
          .sort((a, b) => {
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
              return a.sortOrder - b.sortOrder;
            }
            return a.name.localeCompare(b.name);
          });
        setServices(enabledServices);
        setServicesLoading(false);
      },
      (err) => {
        console.error("[PersonalPricing] Failed to load services", err);
        setServices([]);
        setServicesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load pricing items
  useEffect(() => {
    if (!siteId) return;

    const unsubscribe = subscribePricingItems(
      siteId,
      (items) => {
        setPricingItems(items);
      },
      (err) => {
        console.error("[PersonalPricing] Failed to load pricing items", err);
        setPricingItems([]);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Load personal pricing
  useEffect(() => {
    if (!siteId || !phone) return;

    setPricingLoading(true);
    const unsubscribe = subscribePersonalPricing(
      siteId,
      phone,
      (pricingMap) => {
        // Convert Map<string, PersonalPricing> to Record<string, number>
        // personalPricing from Firestore is: { [serviceTypeId]: number }
        const pricingRecord: Record<string, number> = {};
        
        if (pricingMap instanceof Map) {
          pricingMap.forEach((pricing, serviceTypeId) => {
            if (typeof pricing.price === 'number') {
              pricingRecord[serviceTypeId] = pricing.price;
            }
          });
        } else if (typeof pricingMap === 'object' && pricingMap !== null) {
          // If it's already a plain object
          Object.entries(pricingMap).forEach(([serviceTypeId, value]: [string, any]) => {
            if (typeof value === 'number') {
              pricingRecord[serviceTypeId] = value;
            } else if (value && typeof value.price === 'number') {
              // Handle legacy format if needed
              pricingRecord[serviceTypeId] = value.price;
            }
          });
        }
        
        if (process.env.NODE_ENV === "development") {
          console.log("[PersonalPricingTab] Subscription update received", {
            siteId,
            phone,
            overrideCount: Object.keys(pricingRecord).length,
            serviceTypeIds: Object.keys(pricingRecord),
          });
        }
        
        setPersonalPricing(pricingRecord);
        setPricingLoading(false);
        
        // Update editing prices from personal pricing (merge with existing to preserve unsaved edits)
        setEditingPrices((prev) => {
          const newEditingPrices = new Map(prev);
          Object.entries(pricingRecord).forEach(([serviceTypeId, price]) => {
            // Only update if we don't have an unsaved edit for this serviceTypeId
            // This prevents overwriting user input while they're typing
            if (!newEditingPrices.has(serviceTypeId) || 
                newEditingPrices.get(serviceTypeId) === price.toString()) {
              newEditingPrices.set(serviceTypeId, price.toString());
            }
          });
          return newEditingPrices;
        });
      },
      (err) => {
        console.error("[PersonalPricing] Failed to load personal pricing", {
          siteId,
          phone,
          error: err,
        });
        setPersonalPricing({});
        setPricingLoading(false);
        setError("שגיאה בטעינת תמחור אישי");
        setTimeout(() => setError(null), 5000);
      }
    );

    return () => unsubscribe();
  }, [siteId, phone]);

  // Group pricing items by service
  const itemsByService = useMemo(() => {
    return pricingItems.reduce((acc, item) => {
      const serviceId = item.serviceId || item.service;
      if (!serviceId) return acc;
      if (!acc[serviceId]) {
        acc[serviceId] = [];
      }
      acc[serviceId].push(item);
      return acc;
    }, {} as Record<string, PricingItem[]>);
  }, [pricingItems]);

  // Build override map by serviceTypeId
  // personalPricing is already Record<string, number>
  const overrideByServiceTypeId = useMemo(() => {
    const map = new Map<string, number>();
    // personalPricing is Record<string, number>
    Object.entries(personalPricing).forEach(([serviceTypeId, price]) => {
      if (typeof price === 'number') {
        map.set(serviceTypeId, price);
      }
    });
    return map;
  }, [personalPricing]);

  const handleToggleService = (serviceId: string) => {
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

  const handlePriceChange = (serviceTypeId: string, value: string) => {
    const newEditingPrices = new Map(editingPrices);
    newEditingPrices.set(serviceTypeId, value);
    setEditingPrices(newEditingPrices);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (serviceTypeId: string, serviceId: string) => {
    console.log("[PersonalPricingTab] handleSave START", {
      siteId,
      phone,
      serviceId,
      serviceTypeId,
      inputValue: editingPrices.get(serviceTypeId),
    });

    const priceStr = editingPrices.get(serviceTypeId)?.trim();
    
    if (!priceStr) {
      console.log("[PersonalPricingTab] Validation failed: empty price string");
      setError("יש להזין מחיר");
      return;
    }

    // Convert to number with proper validation
    const price = Number(priceStr);
    console.log("[PersonalPricingTab] computed price", {
      price,
      isNaN: Number.isNaN(price),
      priceStr,
    });

    if (Number.isNaN(price) || price < 0) {
      console.log("[PersonalPricingTab] Validation failed: invalid price", { price, isNaN: Number.isNaN(price) });
      setError("מחיר חייב להיות מספר חיובי");
      return;
    }

    setSavingServiceTypeId(serviceTypeId);
    setError(null);
    setSuccess(null);

    try {
      // Use direct Firestore write with clientDocRef
      const ref = clientDocRef(siteId, phone);
      console.log("[PersonalPricingTab] writing to", {
        path: ref.path,
        fullPath: `sites/${siteId}/clients/${phone}`,
        serviceTypeId,
        price,
      });

      // Read existing personalPricing to preserve other keys
      const existingSnap = await getDoc(ref);
      const existingData = existingSnap.exists() ? existingSnap.data() : {};
      const existingPricing = (existingData.personalPricing || {}) as Record<string, number>;
      
      console.log("[PersonalPricingTab] existing personalPricing", {
        existingPricing,
        existingKeys: Object.keys(existingPricing),
      });

      // Merge new price with existing
      const updatedPricing = {
        ...existingPricing,
        [serviceTypeId]: price,
      };

      // Write using map field with merge
      await setDoc(
        ref,
        {
          updatedAt: serverTimestamp(),
          personalPricing: updatedPricing,
        },
        { merge: true }
      );
      console.log("[PersonalPricingTab] Firestore write OK");

      // Hard verification after write
      const snap = await getDoc(ref);
      console.log("[PersonalPricingTab] POST-SAVE SNAP", {
        exists: snap.exists(),
        data: snap.data(),
        hasPersonalPricing: !!snap.data()?.personalPricing,
        personalPricing: snap.data()?.personalPricing,
        targetKey: serviceTypeId,
        targetValue: snap.data()?.personalPricing?.[serviceTypeId],
      });

      if (!snap.exists()) {
        throw new Error("POST-SAVE verification failed: document does not exist");
      }

      const savedValue = snap.data()?.personalPricing?.[serviceTypeId];
      if (savedValue !== price) {
        throw new Error(`POST-SAVE verification failed: value not persisted. Expected ${price}, got ${savedValue}`);
      }

      console.log("[PersonalPricingTab] POST-SAVE verification passed", {
        serviceTypeId,
        price,
        savedValue,
      });

      // Update local state immediately (optimistic update)
      setPersonalPricing((prev) => ({
        ...(prev ?? {}),
        [serviceTypeId]: price,
      }));

      // Update editing prices to reflect saved value (for UI feedback)
      const newEditingPrices = new Map(editingPrices);
      newEditingPrices.set(serviceTypeId, price.toString());
      setEditingPrices(newEditingPrices);
      
      // Only show success after write AND verification complete
      setSuccess(`מחיר עודכן בהצלחה`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("[PersonalPricingTab] Error saving price", {
        siteId,
        phone,
        serviceTypeId,
        price,
        error: err,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      setError(`שגיאה בשמירת המחיר: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSavingServiceTypeId(null);
    }
  };

  const handleReset = async (serviceTypeId: string) => {
    setResettingServiceTypeId(serviceTypeId);
    setError(null);
    setSuccess(null);

    try {
      await removePersonalPricing(siteId, phone, serviceTypeId);
      
      // DO NOT update local state optimistically - let the subscription update it
      // The subscription will automatically update when Firestore changes
      
      // Remove from editing prices (for UI feedback)
      const newEditingPrices = new Map(editingPrices);
      newEditingPrices.delete(serviceTypeId);
      setEditingPrices(newEditingPrices);
      
      // Only show success after deletion completes
      // (removePersonalPricing throws if verification fails)
      setSuccess(`מחיר אופס למחיר ברירת מחדל`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("[PersonalPricing] Error resetting price", err);
      setError("שגיאה באיפוס המחיר");
      setTimeout(() => setError(null), 3000);
    } finally {
      setResettingServiceTypeId(null);
    }
  };

  // Get default price for a pricing item
  const getDefaultPrice = (item: PricingItem): number => {
    if (item.price !== undefined && item.price !== null) {
      return item.price;
    }
    if (item.priceRangeMin !== undefined && item.priceRangeMin !== null) {
      return item.priceRangeMin;
    }
    return 0;
  };

  if (servicesLoading || pricingLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-500">טוען תמחור אישי...</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-500">אין שירותים זמינים</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Success/Error Messages */}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-right">
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Services Accordion */}
      <div className="space-y-3">
        {services.map((service) => {
          const serviceId = service.name; // Use service name as ID (matches pricing items)
          const items = itemsByService[serviceId] || [];
          const isOpen = openServices.has(serviceId);

          if (items.length === 0) {
            return null; // Skip services with no pricing items
          }

          return (
            <AccordionItem
              key={service.id}
              title={
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="font-semibold text-slate-900">{service.name}</span>
                  <span className="text-xs text-slate-500">
                    {items.length} {items.length === 1 ? "סוג מחיר" : "סוגי מחיר"}
                  </span>
                </div>
              }
              isOpen={isOpen}
              onToggle={() => handleToggleService(serviceId)}
            >
              {/* Service Types Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-300">
                      <th className="text-right p-3 text-sm font-semibold text-slate-700">שם סוג</th>
                      <th className="text-right p-3 text-sm font-semibold text-slate-700">מחיר ברירת מחדל</th>
                      <th className="text-right p-3 text-sm font-semibold text-slate-700">מחיר אישי</th>
                      <th className="text-right p-3 text-sm font-semibold text-slate-700">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const defaultPrice = getDefaultPrice(item);
                      const personalPrice = overrideByServiceTypeId.get(item.id);
                      const editingPrice = editingPrices.get(item.id) || "";
                      const hasOverride = personalPrice !== undefined;

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-3">
                            <span className="font-medium text-slate-900">
                              {item.type || "כללי"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-slate-600">
                              {defaultPrice > 0 ? `₪${defaultPrice.toFixed(2)}` : "—"}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editingPrice}
                                onChange={(e) => handlePriceChange(item.id, e.target.value)}
                                placeholder={hasOverride ? personalPrice.toString() : "—"}
                                className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                                dir="ltr"
                              />
                              <span className="text-xs text-slate-500">₪</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2 justify-start">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("[PersonalPricingTab] SAVE BUTTON CLICKED", {
                                    serviceId,
                                    serviceTypeId: item.id,
                                    phone,
                                    siteId,
                                  });
                                  handleSave(item.id, serviceId);
                                }}
                                disabled={savingServiceTypeId === item.id || resettingServiceTypeId === item.id}
                                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {savingServiceTypeId === item.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>שומר...</span>
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-4 h-4" />
                                    <span>שמור</span>
                                  </>
                                )}
                              </button>
                              {hasOverride && (
                                <button
                                  onClick={() => handleReset(item.id)}
                                  disabled={savingServiceTypeId === item.id || resettingServiceTypeId === item.id}
                                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                  {resettingServiceTypeId === item.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span>מאפס...</span>
                                    </>
                                  ) : (
                                    <>
                                      <X className="w-4 h-4" />
                                      <span>איפוס</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </AccordionItem>
          );
        })}
      </div>

      {/* Info text */}
      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-right">
        <p className="text-xs text-slate-600">
          המחיר האישי יחליף את מחיר ברירת המחדל בעת יצירת תור עבור לקוח זה.
        </p>
      </div>
    </div>
  );
}
