import { getDb } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from "firebase/firestore";
import type { SiteService } from "@/types/siteConfig";

/**
 * Get services array from sites/{siteId}.services
 */
export async function getSiteServices(siteId: string): Promise<SiteService[]> {
  if (!siteId) return [];
  
  try {
    const db = getDb(); // Always get a fresh, valid Firestore instance
    const siteRef = doc(db, "sites", siteId);
    const siteSnap = await getDoc(siteRef);
    
    if (!siteSnap.exists()) {
      return [];
    }
    
    const siteData = siteSnap.data();
    const services = siteData?.services;
    
    if (!Array.isArray(services)) {
      return [];
    }
    
    // Map services and handle backward compatibility: active -> enabled
    return services.map((s: any) => ({
      ...s,
      enabled: s.enabled ?? s.active ?? true, // Map old 'active' to 'enabled', default to true
    })) as SiteService[];
  } catch (err) {
    console.error("[getSiteServices] Failed to get services", err);
    return [];
  }
}

/**
 * Save services array to sites/{siteId}.services
 */
export async function saveSiteServices(
  siteId: string,
  services: SiteService[]
): Promise<void> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const siteRef = doc(db, "sites", siteId);
  const path = `sites/${siteId}`;
  
  // Use setDoc with merge to ensure it works even if document structure changes
  await setDoc(siteRef, {
    services,
    updatedAt: Timestamp.now(),
  }, { merge: true });
  
  console.log(`[saveSiteServices] Saved ${services.length} services to PATH=${path}`);
  console.log(`[saveSiteServices] Services data:`, services.map(s => ({ id: s.id, name: s.name, enabled: s.enabled })));
}

/**
 * Add a new service to the services array
 */
export async function addSiteService(
  siteId: string,
  service: Omit<SiteService, "id">
): Promise<string> {
  const existingServices = await getSiteServices(siteId);
  const path = `sites/${siteId}`;
  
  console.log(`[addSiteService] PATH=${path} - Current services count: ${existingServices.length}`);
  
  // Generate ID (simple timestamp-based, or use a more robust method)
  const newId = `svc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newService: SiteService = {
    ...service,
    id: newId,
    enabled: service.enabled !== false, // Default to true
    sortOrder: service.sortOrder ?? existingServices.length,
  };
  
  console.log(`[addSiteService] PATH=${path} - Adding service:`, { id: newId, name: newService.name, enabled: newService.enabled });
  
  const updatedServices = [...existingServices, newService];
  await saveSiteServices(siteId, updatedServices);
  
  console.log(`[addSiteService] PATH=${path} - Service added successfully, new count: ${updatedServices.length}`);
  
  return newId;
}

/**
 * Update an existing service in the services array
 */
export async function updateSiteService(
  siteId: string,
  serviceId: string,
  updates: Partial<Omit<SiteService, "id">>
): Promise<void> {
  const existingServices = await getSiteServices(siteId);
  const serviceIndex = existingServices.findIndex((s) => s.id === serviceId);
  
  if (serviceIndex === -1) {
    throw new Error(`Service with id ${serviceId} not found`);
  }
  
  const updatedServices = [...existingServices];
  updatedServices[serviceIndex] = {
    ...updatedServices[serviceIndex],
    ...updates,
  };
  
  await saveSiteServices(siteId, updatedServices);
}

/**
 * Delete a service from the services array
 */
export async function deleteSiteService(
  siteId: string,
  serviceId: string
): Promise<void> {
  const existingServices = await getSiteServices(siteId);
  const updatedServices = existingServices.filter((s) => s.id !== serviceId);
  
  await saveSiteServices(siteId, updatedServices);
}

/**
 * Subscribe to services array changes (realtime)
 * Returns unsubscribe function
 */
export function subscribeSiteServices(
  siteId: string,
  onUpdate: (services: SiteService[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const db = getDb(); // Always get a fresh, valid Firestore instance
    const siteRef = doc(db, "sites", siteId);
    
    return onSnapshot(
      siteRef,
      async (snap) => {
        if (!snap.exists()) {
          onUpdate([]);
          return;
        }
        
        const siteData = snap.data();
        const services = siteData?.services;
        const path = `sites/${siteId}`;
        
        if (!Array.isArray(services)) {
          console.log(`[subscribeSiteServices] PATH=${path} - services is not an array, type:`, typeof services, services);
          // Try migration if services array doesn't exist (backward compatibility)
          try {
            await migrateServicesFromSubcollection(siteId);
            // Re-fetch after migration
            const migratedServices = await getSiteServices(siteId);
            console.log(`[subscribeSiteServices] PATH=${path} - After migration, loaded ${migratedServices.length} services`);
            onUpdate(migratedServices);
          } catch (err) {
            console.error("[subscribeSiteServices] Migration failed", err);
            onUpdate([]);
          }
          return;
        }
        
        // Map services and handle backward compatibility: active -> enabled
        const mappedServices = services.map((s: any) => ({
          ...s,
          enabled: s.enabled ?? s.active ?? true, // Map old 'active' to 'enabled', default to true
        })) as SiteService[];
        
        console.log(`[subscribeSiteServices] PATH=${path} - Loaded ${mappedServices.length} services:`, mappedServices.map(s => ({ id: s?.id, name: s?.name, enabled: s?.enabled })));
        onUpdate(mappedServices);
      },
      (err) => {
        console.error("[subscribeSiteServices] error", err);
        if (onError) onError(err as Error);
      }
    );
  } catch (err) {
    console.error("[subscribeSiteServices] Failed to initialize subscription", err);
    if (onError) onError(err as Error);
    return () => {}; // Return no-op unsubscribe function
  }
}

/**
 * Migrate services from old subcollection to services array
 * This is a one-time migration function (for backward compatibility)
 */
export async function migrateServicesFromSubcollection(siteId: string): Promise<void> {
  try {
    // Check if services array already exists
    const existingServices = await getSiteServices(siteId);
    if (existingServices.length > 0) {
      console.log("[migrateServicesFromSubcollection] Services array already exists, skipping migration");
      return;
    }
    
    // Try to load from old subcollection (legacy: users/{ownerUid}/site/main/services)
    // Migration only works when siteId === ownerUid (legacy single-tenant); otherwise no-op
    try {
      const siteSnap = await getDoc(doc(getDb(), "sites", siteId));
      const ownerUid = siteSnap.data()?.ownerUid ?? siteSnap.data()?.ownerUserId;
      if (!ownerUid) return;
      const { getServices } = await import("@/lib/firestoreServices");
      const oldServices = await getServices(ownerUid);
      
      if (oldServices.length === 0) {
        console.log("[migrateServicesFromSubcollection] No old services found, skipping migration");
        return;
      }
      
      // Convert old Service[] to SiteService[]
      const migratedServices: SiteService[] = oldServices.map((old, index) => ({
        id: old.id,
        name: old.name,
        enabled: old.active !== false,
        sortOrder: index,
      }));
      
      // Save to new location
      await saveSiteServices(siteId, migratedServices);
      
      console.log(`[migrateServicesFromSubcollection] Migrated ${migratedServices.length} services from subcollection to array`);
    } catch (err) {
      // Old subcollection might not exist - that's fine
      console.log("[migrateServicesFromSubcollection] Old subcollection not found, skipping migration");
    }
  } catch (err) {
    console.error("[migrateServicesFromSubcollection] Migration failed", err);
    // Don't throw - migration is optional
  }
}
