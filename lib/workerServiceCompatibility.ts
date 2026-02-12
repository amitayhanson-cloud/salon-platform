/**
 * Worker–service compatibility: single source of truth for "can this worker perform this service?"
 * Used by booking availability, admin, and calendar. No duplicated logic.
 *
 * Source of truth: Workers page stores worker.services as an array of SERVICE NAMES (SiteService.name).
 * Optional: worker.allowedServiceIds (array of service IDs) for ID-based matching.
 * Matching: idMatch OR nameMatch (normalized). Do NOT require both.
 */

export interface WorkerForCompatibility {
  active?: boolean;
  /** Service names this worker can perform (Workers page stores SiteService.name here). */
  services?: (string | number)[];
  /** Optional: service IDs this worker can perform. If present, ID matching is tried first. */
  allowedServiceIds?: (string | number)[];
  /** If true, worker can perform all services regardless of services array. Optional; default false. */
  allServicesAllowed?: boolean;
}

/**
 * Normalize a service key for comparison: trim, collapse spaces, lowercase ASCII only (Hebrew unchanged).
 */
export function normalizeServiceKey(s: string): string {
  if (s == null || typeof s !== "string") return "";
  let t = s.trim().replace(/\s+/g, " ");
  // Lowercase ASCII letters only; leave Hebrew and other non-ASCII as-is
  t = t.replace(/[A-Za-z]/g, (c) => c.toLowerCase());
  return t;
}

/** Get the worker's allowed list: services (names) and optionally allowedServiceIds (ids). */
function getAllowedList(worker: WorkerForCompatibility): string[] {
  const fromServices = Array.isArray(worker.services)
    ? worker.services.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const fromIds = Array.isArray(worker.allowedServiceIds)
    ? worker.allowedServiceIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return [...fromServices, ...fromIds];
}

/**
 * Returns true iff the worker can perform the given service (by single identifier).
 * Uses normalized comparison: trim, collapse spaces, lowercase ASCII only.
 */
export function canWorkerPerformService(
  worker: WorkerForCompatibility,
  serviceIdOrName: string
): boolean {
  if (worker.active === false) {
    return false;
  }
  const key = normalizeServiceKey(String(serviceIdOrName));
  if (!key) {
    return false;
  }
  if (worker.allServicesAllowed === true) {
    return true;
  }
  const allowed = getAllowedList(worker);
  if (allowed.length === 0) {
    return false;
  }
  return allowed.some((a) => normalizeServiceKey(a) === key);
}

/**
 * Returns true iff the worker can perform the given service by id OR name (or displayName).
 * Prefer ID match if worker has allowedServiceIds; otherwise fallback to normalized name match.
 * idMatch OR nameMatch — do not require both.
 */
export function workerCanDoServiceForService(
  worker: WorkerForCompatibility,
  service: { id?: string | null; name?: string | null; displayName?: string | null }
): boolean {
  if (worker.active === false) return false;
  if (worker.allServicesAllowed === true) return true;
  const allowed = getAllowedList(worker);
  if (allowed.length === 0) return false;

  const toTry = [
    service.id,
    service.name,
    service.displayName,
  ].filter((x): x is string => typeof x === "string" && x.trim() !== "");

  for (const key of toTry) {
    if (canWorkerPerformService(worker, key)) return true;
  }
  return false;
}

/** Single identifier API: same as canWorkerPerformService (normalized match). */
export function workerCanDoService(worker: WorkerForCompatibility, serviceId: string): boolean {
  return canWorkerPerformService(worker, serviceId);
}

/**
 * Filter workers to those who can perform the given service (single identifier).
 */
export function workersWhoCanPerformService<T extends WorkerForCompatibility>(
  workers: T[],
  serviceIdOrName: string
): T[] {
  if (!serviceIdOrName?.trim()) return [];
  return workers.filter((w) => canWorkerPerformService(w, serviceIdOrName));
}

/**
 * Filter workers to those who can perform the given service (by id, name, or displayName).
 * Use this when you have a full service object so both ID and name matching are tried.
 */
export function workersWhoCanPerformServiceForService<T extends WorkerForCompatibility>(
  workers: T[],
  service: { id?: string | null; name?: string | null; displayName?: string | null }
): T[] {
  return workers.filter((w) => workerCanDoServiceForService(w, service));
}
