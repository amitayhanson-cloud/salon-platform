import type { PublicSiteTemplateId, SiteConfig } from "@/types/siteConfig";

/** Aligns with each public landing template (admin + builder). */
export const PUBLIC_TEMPLATE_SALON_TYPE: Record<
  PublicSiteTemplateId,
  SiteConfig["salonType"]
> = {
  "hair-luxury": "hair",
  "gentlemans-barber": "barber",
  "vogue-nails": "nails",
};

/** Shared intro above the template cards (admin Site tab + onboarding builder). */
export const PUBLIC_SITE_TEMPLATE_PICKER_INTRO_HE =
  "בוחרים איך דף הנחיתה הציבורי נראה (שיער יוקרתי, ברברשופ, או ציפורניים). אפשר לשנות בכל עת; לחצו \"שמור שינויים\" כדי לעדכן את האתר החי.";

/**
 * Card hero shots for the template picker (must load reliably in small cards).
 * Barber / nails URLs match the defaults in BarberTemplate and VogueNailsShell.
 * Hair uses a public hero-style photo; `/templates/hair/...` assets are optional in deploys.
 */
const CARD_HERO_HAIR_LUXURY =
  "https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?w=1920&q=80";
const CARD_HERO_GENTLEMANS_BARBER =
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1920&q=80";
const CARD_HERO_VOGUE_NAILS =
  "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1920&q=80";

/**
 * Onboarding template picker: metadata + thumbnails.
 * Live previews render via {@link BuilderTemplateSelector} modal.
 */
export const BUILDER_PUBLIC_TEMPLATES: ReadonlyArray<{
  id: PublicSiteTemplateId;
  nameHe: string;
  nameEn: string;
  /** Short line under the title */
  taglineHe: string;
  thumbnailSrc: string;
}> = [
  {
    id: "hair-luxury",
    nameHe: "שיער יוקרתי",
    nameEn: "Luxury Hair",
    taglineHe: "מראה כהה וזהב — מתאים לספרות ועיצוב שיער",
    thumbnailSrc: CARD_HERO_HAIR_LUXURY,
  },
  {
    id: "gentlemans-barber",
    nameHe: "מועדון הג׳נטלמן",
    nameEn: "Gentleman's Barber",
    taglineHe: "ברברשופ פרימיום עם זהב ועור",
    thumbnailSrc: CARD_HERO_GENTLEMANS_BARBER,
  },
  {
    id: "vogue-nails",
    nameHe: "ווג ציפורניים",
    nameEn: "Vogue Nails",
    taglineHe: "אסתטיקה נקייה לסלון ציפורניים",
    thumbnailSrc: CARD_HERO_VOGUE_NAILS,
  },
];

export function isPublicSiteTemplateId(v: string): v is PublicSiteTemplateId {
  return BUILDER_PUBLIC_TEMPLATES.some((t) => t.id === v);
}
