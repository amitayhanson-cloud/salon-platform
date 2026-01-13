import type { SiteConfig } from "@/types/siteConfig";

/**
 * Check if online booking is enabled for a site
 * @param config - SiteConfig or null/undefined
 * @returns true if bookingOption === "simple_form", false otherwise
 */
export function bookingEnabled(config: SiteConfig | null | undefined): boolean {
  if (!config) return false;
  return config.bookingOption === "simple_form";
}

