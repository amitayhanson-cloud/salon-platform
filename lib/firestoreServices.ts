/**
 * @deprecated LEGACY: Uses users/{userId}/site/main/services.
 * Canonical model is sites/{siteId}.services (see firestoreSiteServices).
 * Only used by migrateServicesFromSubcollection for one-time migration.
 * TODO: Remove this module once all sites have been migrated; do not use for new code.
 */

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
import type { Service } from "@/types/service";

/** @deprecated Legacy path users/{userId}/site/main/services */
export function servicesCollection(userId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "users", userId, "site", "main", "services");
}

export function serviceDoc(userId: string, serviceId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "users", userId, "site", "main", "services", serviceId);
}

export async function getServices(userId: string): Promise<Service[]> {
  if (!db || !userId) return [];
  
  try {
    const q = query(servicesCollection(userId), orderBy("name", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || "",
        active: data.active !== false, // Default to true
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      } as Service;
    });
  } catch (err) {
    console.error("Failed to get services", err);
    return [];
  }
}

export function subscribeServices(
  userId: string,
  onUpdate: (services: Service[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!db || !userId) return () => {};

  try {
    const q = query(servicesCollection(userId), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const services = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || "",
            active: data.active !== false, // Default to true
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          } as Service;
        });
        onUpdate(services);
      },
      (err) => {
        console.error("Failed to subscribe to services", err);
        if (onError) onError(err as Error);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error("Failed to set up services subscription", err);
    if (onError) onError(err as Error);
    return () => {};
  }
}

export async function createService(
  userId: string,
  service: Omit<Service, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  if (!db || !userId) throw new Error("Firebase not initialized");

  const now = new Date().toISOString();
  const docRef = await addDoc(servicesCollection(userId), {
    name: service.name,
    active: service.active !== false, // Default to true
    createdAt: Timestamp.fromDate(new Date(now)),
    updatedAt: Timestamp.fromDate(new Date(now)),
  });
  return docRef.id;
}

export async function updateService(
  userId: string,
  serviceId: string,
  updates: Partial<Omit<Service, "id" | "createdAt">>
): Promise<void> {
  if (!db || !userId) throw new Error("Firebase not initialized");

  const updateData: any = {
    ...updates,
    updatedAt: Timestamp.fromDate(new Date()),
  };
  
  // Convert ISO strings to Timestamps if present
  if (updateData.createdAt && typeof updateData.createdAt === "string") {
    updateData.createdAt = Timestamp.fromDate(new Date(updateData.createdAt));
  }

  await updateDoc(serviceDoc(userId, serviceId), updateData);
}

export async function deleteService(userId: string, serviceId: string): Promise<void> {
  if (!db || !userId) throw new Error("Firebase not initialized");
  await deleteDoc(serviceDoc(userId, serviceId));
}
