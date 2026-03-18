import type { PricingItem } from "@/types/pricingItem";

/**
 * Catalog revenue for שלב 1 (row price). When there is a follow-up without explicit
 * followUp.price in Firestore, the row still holds the full package — all of it
 * attributes to phase 1 until the admin splits prices.
 */
export function catalogRevenuePhase1(item: PricingItem | undefined): number {
  if (!item) return 0;
  return Number(item.price ?? item.priceRangeMin ?? 0);
}

/**
 * Catalog revenue for שלב 2. Only when followUp.price is a number (saved from admin).
 */
export function catalogRevenuePhase2(item: PricingItem | undefined): number {
  if (!item?.hasFollowUp || !item.followUp) return 0;
  const p = item.followUp.price;
  if (typeof p !== "number" || Number.isNaN(p)) return 0;
  return Math.max(0, p);
}
