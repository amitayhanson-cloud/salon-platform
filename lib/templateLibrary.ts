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

/** Template key used in sites and preview (e.g. "hair1", "barber1"). */
export type TemplateKey = "hair1" | "hair2" | "barber1" | "nails1";

const barberLuxuryTemplate: TemplateDefinition = {
  id: "barber_luxury_v1",
  category: "barber",
  style: "luxury",
  assets: {
    colors: {
      background: "#1a1a1a",
      surface: "#1f1f1f",
      primary: "#d4a853",
      secondary: "#8b4513",
      textOnDark: "#f5f5f0",
      textOnLight: "#1a1a1a",
    },
    images: {
      hero: [],
      gallery: [],
    },
  },
};

const vogueNailsTemplate: TemplateDefinition = {
  id: "vogue_nails_v1",
  category: "nails",
  style: "luxury",
  assets: {
    colors: {
      background: "#faf8f3",
      surface: "#f0ebe5",
      primary: "#c4788c",
      secondary: "#9cb4c8",
      textOnDark: "#faf8f3",
      textOnLight: "#2d1f26",
    },
    images: {
      hero: [],
      gallery: [],
    },
  },
};

const TEMPLATE_MAP: Record<string, TemplateDefinition> = {
  hair1: hairLuxuryTemplate,
  barber1: barberLuxuryTemplate,
  nails1: vogueNailsTemplate,
};

/**
 * Get template definition by key. Used by WebsiteRenderer for public/preview.
 * Adding a new template = add to TEMPLATE_MAP and render branch in WebsiteRenderer.
 */
export function getTemplateByKey(key: string): TemplateDefinition {
  const template = TEMPLATE_MAP[key];
  if (template) return template;
  return hairLuxuryTemplate;
}

