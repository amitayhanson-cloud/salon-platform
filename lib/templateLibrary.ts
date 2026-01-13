import type { SiteConfig } from "@/types/siteConfig";

export type BusinessCategory = "hair" | "barber" | "nails";

export type TemplateStyle = "luxury" | "soft_pastel" | "fun_colorful";

export interface TemplateAssets {
  colors: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    textOnDark: string;
    textOnLight: string;
  };
  images: {
    hero: string[]; // hero background options
    gallery: string[]; // gallery options
  };
}

export interface TemplateDefinition {
  id: string;
  category: BusinessCategory;
  style: TemplateStyle;
  assets: TemplateAssets;
}

export const hairLuxuryTemplate: TemplateDefinition = {
  id: "hair_luxury_v1",
  category: "hair",
  style: "luxury",
  assets: {
    colors: {
      // NOT full black. Use a deep blue-grey background,
      // soft light surfaces, and a muted gold accent.
      background: "#050816", // deep blue-black
      surface: "#0f172a", // slate / dark blue surface
      primary: "#e2b857", // muted gold
      secondary: "#0b1120", // deep navy
      textOnDark: "#f9fafb",
      textOnLight: "#0f172a",
    },
    images: {
      // placeholder URLs – I will swap these later
      hero: [
        "/images/hair-luxury-hero-1.jpg",
        "/images/hair-luxury-hero-2.jpg",
      ],
      gallery: [
        "/images/hair-luxury-g1.jpg",
        "/images/hair-luxury-g2.jpg",
        "/images/hair-luxury-g3.jpg",
      ],
    },
  },
};

export function getTemplateForConfig(
  config: SiteConfig
): TemplateDefinition {
  // For now we only support hair + luxury.
  // Later we will branch by salonType and style.
  return hairLuxuryTemplate;
}

