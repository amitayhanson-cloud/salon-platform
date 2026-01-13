import type { SiteConfig } from "@/types/siteConfig";
import { BaseSalonTemplate } from "./BaseSalonTemplate";

export type SalonTemplateId = "base-salon-1";

export type SalonTemplateComponent = React.ComponentType<{
  config: SiteConfig;
}>;

export const salonTemplates = {
  "base-salon-1": BaseSalonTemplate,
} as const;

export function getTemplateForConfig(
  config: SiteConfig
): {
  id: SalonTemplateId;
  Component: SalonTemplateComponent;
} {
  // For now always return the base template.
  // In future we'll choose based on salonType and vibe.
  // Example future logic:
  // if (config.salonType === "hair" && config.vibe === "luxury") {
  //   return { id: "hair-luxury-1", Component: HairLuxuryTemplate };
  // }
  return {
    id: "base-salon-1" as SalonTemplateId,
    Component: BaseSalonTemplate,
  };
}

