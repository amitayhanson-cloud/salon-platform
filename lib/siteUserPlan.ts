import type { SiteUserPlan } from "@/types/siteBilling";

const PREMIUM_ALIASES = new Set(["premium", "plus", "pro", "enterprise"]);

/**
 * Normalize Firestore `userPlan` (or legacy `plan`) on site or user doc.
 */
export function normalizeSiteUserPlan(raw: unknown): SiteUserPlan {
  if (raw == null || raw === "") return "basic";
  const s = String(raw).trim().toLowerCase();
  if (PREMIUM_ALIASES.has(s)) return "premium";
  return "basic";
}

export function isPremiumPlan(plan: SiteUserPlan): boolean {
  return plan === "premium";
}
