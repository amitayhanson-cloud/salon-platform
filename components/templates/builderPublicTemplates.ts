import type { PublicSiteTemplateId } from "@/types/siteConfig";

/**
 * Onboarding template picker: metadata + thumbnails (public/ paths).
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
    thumbnailSrc: "/images/hero-bg.png",
  },
  {
    id: "gentlemans-barber",
    nameHe: "מועדון הג׳נטלמן",
    nameEn: "Gentleman's Barber",
    taglineHe: "ברברשופ פרימיום עם זהב ועור",
    thumbnailSrc: "/images/gradient-background.jpg",
  },
  {
    id: "vogue-nails",
    nameHe: "ווג ציפורניים",
    nameEn: "Vogue Nails",
    taglineHe: "אסתטיקה נקייה לסלון ציפורניים",
    thumbnailSrc: "/images/property-city-loft.jpg",
  },
];

export function isPublicSiteTemplateId(v: string): v is PublicSiteTemplateId {
  return BUILDER_PUBLIC_TEMPLATES.some((t) => t.id === v);
}
