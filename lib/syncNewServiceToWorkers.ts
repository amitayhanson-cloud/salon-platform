/**
 * When a new site service is added, attach it to every worker so זמינות / booking stay in sync.
 * Workers with an explicit non-empty services[] get the new service name appended.
 * Workers with empty/missing services[] are treated like the admin UI ("כל השירותים"):
 * we set services to all enabled service names so they don't end up restricted to only the new one.
 */

import { getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { workersCollection, workerDoc } from "@/lib/firestorePaths";
import { normalizeServiceKey } from "@/lib/workerServiceCompatibility";
import type { SiteService } from "@/types/siteConfig";

const BATCH_SIZE = 500;

function nameInList(name: string, list: string[]): boolean {
  const k = normalizeServiceKey(name);
  if (!k) return false;
  return list.some((x) => normalizeServiceKey(x) === k);
}

/** One canonical name per normalized key (first occurrence wins). */
function uniqueServiceNames(services: SiteService[]): string[] {
  const enabled = services.filter((s) => s.enabled !== false);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of enabled) {
    const n = typeof s.name === "string" ? s.name.trim() : "";
    if (!n) continue;
    const k = normalizeServiceKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * After sites/{siteId}.services gains `newService`, update workers subcollection.
 */
export async function syncNewSiteServiceToWorkers(
  siteId: string,
  newService: SiteService,
  allServices: SiteService[]
): Promise<{ updatedCount: number }> {
  const firestore = db;
  if (!firestore) throw new Error("Firestore db not initialized");

  const newName =
    typeof newService.name === "string" ? newService.name.trim() : "";
  if (!newName) {
    return { updatedCount: 0 };
  }

  const enabledNames = uniqueServiceNames(allServices);
  if (!nameInList(newName, enabledNames)) {
    // Disabled new service — still skip worker updates (nothing to offer)
    return { updatedCount: 0 };
  }

  const snapshot = await getDocs(workersCollection(siteId));
  const pending: Array<{ workerId: string; services: string[] }> = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.allServicesAllowed === true) return;

    const current = Array.isArray(data.services)
      ? data.services
          .map((x: unknown) => String(x).trim())
          .filter(Boolean)
      : [];

    let next: string[];
    if (current.length === 0) {
      next = [...enabledNames];
    } else if (nameInList(newName, current)) {
      return;
    } else {
      next = [...current, newName];
    }

    pending.push({ workerId: docSnap.id, services: next });
  });

  let updatedCount = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestore);
    const chunk = pending.slice(i, i + BATCH_SIZE);
    for (const { workerId, services } of chunk) {
      batch.update(workerDoc(siteId, workerId), { services });
      updatedCount++;
    }
    await batch.commit();
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[syncNewSiteServiceToWorkers]", {
      siteId,
      newName,
      updatedCount,
    });
  }

  return { updatedCount };
}
