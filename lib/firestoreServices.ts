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

export function servicesCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "services");
}

export function serviceDoc(siteId: string, serviceId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "services", serviceId);
}

export async function getServices(siteId: string): Promise<Service[]> {
  if (!db || !siteId) return [];
  
  try {
    const q = query(servicesCollection(siteId), orderBy("name", "asc"));
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
  siteId: string,
  onUpdate: (services: Service[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!db || !siteId) return () => {};

  try {
    const q = query(servicesCollection(siteId), orderBy("name", "asc"));
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
  siteId: string,
  service: Omit<Service, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  if (!db || !siteId) throw new Error("Firebase not initialized");

  const now = new Date().toISOString();
  const docRef = await addDoc(servicesCollection(siteId), {
    name: service.name,
    active: service.active !== false, // Default to true
    createdAt: Timestamp.fromDate(new Date(now)),
    updatedAt: Timestamp.fromDate(new Date(now)),
  });
  return docRef.id;
}

export async function updateService(
  siteId: string,
  serviceId: string,
  updates: Partial<Omit<Service, "id" | "createdAt">>
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

  await updateDoc(serviceDoc(siteId, serviceId), updateData);
}

export async function deleteService(siteId: string, serviceId: string): Promise<void> {
  if (!db || !siteId) throw new Error("Firebase not initialized");
  await deleteDoc(serviceDoc(siteId, serviceId));
}
