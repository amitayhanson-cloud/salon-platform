import type { SiteConfig } from "@/types/siteConfig";

/**
 * Booking is always enabled for all sites (no "no booking" option).
 * Treats missing or legacy false/other values as true for migration.
 */
export function bookingEnabled(config: SiteConfig | null | undefined): boolean {
  if (!config) return false;
  return true;
}

