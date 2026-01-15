import { db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import type { PricingItem, PricingCategory } from "@/types/pricingItem";

export function pricingItemsCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "pricingItems");
}

export function pricingItemDoc(siteId: string, itemId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "pricingItems", itemId);
}

export function pricingCategoriesCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "pricingCategories");
}

export function pricingCategoryDoc(siteId: string, categoryId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "pricingCategories", categoryId);
}

export async function getPricingItems(siteId: string): Promise<PricingItem[]> {
  if (!db || !siteId) return [];
  
  try {
    const q = query(pricingItemsCollection(siteId), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      // Backward compatibility: if serviceId is missing but service exists, use service as serviceId
      const serviceId = data.serviceId || data.service;
      
      // Backward compatibility: handle old durationMinutes field
      let durationMinMinutes: number;
      let durationMaxMinutes: number;
      if (data.durationMinMinutes !== undefined && data.durationMaxMinutes !== undefined) {
        // New format: use min/max
        durationMinMinutes = data.durationMinMinutes;
        durationMaxMinutes = data.durationMaxMinutes;
      } else if (data.durationMinutes !== undefined) {
        // Old format: use single duration for both min and max
        durationMinMinutes = data.durationMinutes;
        durationMaxMinutes = data.durationMinutes;
      } else {
        // Fallback: default to 30 minutes
        durationMinMinutes = 30;
        durationMaxMinutes = 30;
      }
      
      return {
        id: d.id,
        ...data,
        serviceId: serviceId || undefined,
        service: serviceId || data.service || undefined, // Keep service for backward compatibility
        durationMinMinutes,
        durationMaxMinutes,
        // Ensure backward compatibility - default hasFollowUp to false if not present
        hasFollowUp: data.hasFollowUp ?? false,
        followUpServiceId: data.followUpServiceId ?? null,
        followUpDurationMinutes: data.followUpDurationMinutes ?? null,
        followUpWaitMinutes: data.followUpWaitMinutes ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      } as PricingItem;
    });
  } catch (err) {
    console.error("Failed to get pricing items", err);
    return [];
  }
}

export function subscribePricingItems(
  siteId: string,
  onUpdate: (items: PricingItem[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!db || !siteId) return () => {};

  try {
    const q = query(pricingItemsCollection(siteId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => {
          const data = d.data();
          // Backward compatibility: if serviceId is missing but service exists, use service as serviceId
          const serviceId = data.serviceId || data.service;
          
          // Backward compatibility: handle old durationMinutes field
          let durationMinMinutes: number;
          let durationMaxMinutes: number;
          if (data.durationMinMinutes !== undefined && data.durationMaxMinutes !== undefined) {
            // New format: use min/max
            durationMinMinutes = data.durationMinMinutes;
            durationMaxMinutes = data.durationMaxMinutes;
          } else if (data.durationMinutes !== undefined) {
            // Old format: use single duration for both min and max
            durationMinMinutes = data.durationMinutes;
            durationMaxMinutes = data.durationMinutes;
          } else {
            // Fallback: default to 30 minutes
            durationMinMinutes = 30;
            durationMaxMinutes = 30;
          }
          
          return {
            id: d.id,
            ...data,
            serviceId: serviceId || undefined,
            service: serviceId || data.service || undefined, // Keep service for backward compatibility
            durationMinMinutes,
            durationMaxMinutes,
            // Ensure backward compatibility - default hasFollowUp to false if not present
            hasFollowUp: data.hasFollowUp ?? false,
            followUpServiceId: data.followUpServiceId ?? null,
            followUpDurationMinutes: data.followUpDurationMinutes ?? null,
            followUpWaitMinutes: data.followUpWaitMinutes ?? null,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          } as PricingItem;
        });
        onUpdate(items);
      },
      (err) => {
        console.error("Failed to subscribe to pricing items", err);
        if (onError) onError(err as Error);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error("Failed to set up pricing items subscription", err);
    if (onError) onError(err as Error);
    return () => {};
  }
}

export async function createPricingItem(
  siteId: string,
  item: Omit<PricingItem, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  if (!db || !siteId) throw new Error("Firebase not initialized");

  const now = new Date().toISOString();
  const docRef = await addDoc(pricingItemsCollection(siteId), {
    ...item,
    createdAt: Timestamp.fromDate(new Date(now)),
    updatedAt: Timestamp.fromDate(new Date(now)),
  });
  return docRef.id;
}

export async function updatePricingItem(
  siteId: string,
  itemId: string,
  updates: Partial<Omit<PricingItem, "id" | "createdAt">>
): Promise<void> {
  if (!db || !siteId) throw new Error("Firebase not initialized");

  const updateData: any = {
    ...updates,
    updatedAt: Timestamp.fromDate(new Date()),
  };
  
  // Convert ISO strings to Timestamps if present
  if (updateData.createdAt && typeof updateData.createdAt === "string") {
    updateData.createdAt = Timestamp.fromDate(new Date(updateData.createdAt));
  }

  await updateDoc(pricingItemDoc(siteId, itemId), updateData);
}

export async function deletePricingItem(siteId: string, itemId: string): Promise<void> {
  if (!db || !siteId) throw new Error("Firebase not initialized");
  await deleteDoc(pricingItemDoc(siteId, itemId));
}

export async function getPricingCategories(siteId: string): Promise<PricingCategory[]> {
  if (!db || !siteId) return [];
  
  try {
    const q = query(pricingCategoriesCollection(siteId), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as PricingCategory[];
  } catch (err) {
    console.error("Failed to get pricing categories", err);
    return [];
  }
}

export function subscribePricingCategories(
  siteId: string,
  onUpdate: (categories: PricingCategory[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!db || !siteId) return () => {};

  try {
    const q = query(pricingCategoriesCollection(siteId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const categories = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as PricingCategory[];
        onUpdate(categories);
      },
      (err) => {
        console.error("Failed to subscribe to pricing categories", err);
        if (onError) onError(err as Error);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error("Failed to set up pricing categories subscription", err);
    if (onError) onError(err as Error);
    return () => {};
  }
}

export async function createPricingCategory(
  siteId: string,
  category: Omit<PricingCategory, "id">
): Promise<string> {
  if (!db || !siteId) throw new Error("Firebase not initialized");

  const docRef = await addDoc(pricingCategoriesCollection(siteId), category);
  return docRef.id;
}

export async function updatePricingCategory(
  siteId: string,
  categoryId: string,
  updates: Partial<Omit<PricingCategory, "id">>
): Promise<void> {
  if (!db || !siteId) throw new Error("Firebase not initialized");
  await updateDoc(pricingCategoryDoc(siteId, categoryId), updates);
}

export async function deletePricingCategory(siteId: string, categoryId: string): Promise<void> {
  if (!db || !siteId) throw new Error("Firebase not initialized");
  await deleteDoc(pricingCategoryDoc(siteId, categoryId));
}
