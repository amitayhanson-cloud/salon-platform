/**
 * Worker–service compatibility: single source of truth for "can this worker perform this service?"
 * Used by booking availability, admin, and calendar. No duplicated logic.
 *
 * Workers store services as an array of service identifiers (names; see workers admin).
 * Service identifier = service name from business services list (SiteService.name).
 */

export interface WorkerForCompatibility {
  active?: boolean;
  /** Service identifiers this worker can perform (e.g. service names from business services). */
  services?: string[];
}

/**
 * Returns true iff the worker can perform the given service.
 * - Worker must be active (active !== false).
 * - If worker has no services array or empty array: backward compatibility → can do all services (true).
 * - Otherwise: worker.services must include serviceIdOrName.
 */
export function canWorkerPerformService(
  worker: WorkerForCompatibility,
  serviceIdOrName: string
): boolean {
  if (worker.active === false) {
    return false;
  }
  if (!serviceIdOrName || !serviceIdOrName.trim()) {
    return false;
  }
  const id = serviceIdOrName.trim();
  if (!Array.isArray(worker.services) || worker.services.length === 0) {
    return true; // backward compatibility: no assignment = available for all
  }
  return worker.services.includes(id);
}

/**
 * Filter workers to those who can perform the given service.
 */
export function workersWhoCanPerformService<T extends WorkerForCompatibility>(
  workers: T[],
  serviceIdOrName: string
): T[] {
  if (!serviceIdOrName?.trim()) return [];
  return workers.filter((w) => canWorkerPerformService(w, serviceIdOrName));
}
