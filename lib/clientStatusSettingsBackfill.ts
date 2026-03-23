/**
 * Detect incomplete `sites/{siteId}/settings/clients` payloads.
 * Empty `statusRules: {}` is truthy in JS but must still be backfilled.
 */
export function firestoreClientSettingsDataNeedsBackfill(data: unknown): boolean {
  if (data == null || typeof data !== "object") return true;
  const d = data as Record<string, unknown>;

  const r = d.statusRules;
  if (r == null || typeof r !== "object") return true;
  const rules = r as Record<string, unknown>;
  const numericKeys = [
    "newMaxTotalBookings",
    "activeMinBookings",
    "activeWindowDays",
    "sleepingNoBookingsFor",
  ] as const;
  for (const key of numericKeys) {
    const n = Number(rules[key]);
    if (!Number.isFinite(n) || n < 1) return true;
  }
  const u = rules.sleepingWindowUnit;
  if (u !== "days" && u !== "months") return true;

  if (!Array.isArray(d.manualTags)) return true;

  return false;
}
