import type { ClientStatusRules } from "@/types/clientStatus";
import { DEFAULT_CLIENT_STATUS_RULES } from "@/types/clientStatus";

/** Normalize rules from Firestore / API body (same logic as settings save). */
export function normalizeClientStatusRules(raw: Partial<ClientStatusRules> | undefined): ClientStatusRules {
  const src = raw ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  };
  return {
    newMaxTotalBookings: num(src.newMaxTotalBookings, DEFAULT_CLIENT_STATUS_RULES.newMaxTotalBookings),
    activeMinBookings: num(src.activeMinBookings, DEFAULT_CLIENT_STATUS_RULES.activeMinBookings),
    activeWindowDays: num(src.activeWindowDays, DEFAULT_CLIENT_STATUS_RULES.activeWindowDays),
    sleepingNoBookingsFor: num(src.sleepingNoBookingsFor, DEFAULT_CLIENT_STATUS_RULES.sleepingNoBookingsFor),
    sleepingWindowUnit: src.sleepingWindowUnit === "months" ? "months" : "days",
  };
}
