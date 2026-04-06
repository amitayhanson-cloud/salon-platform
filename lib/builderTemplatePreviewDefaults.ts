import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { defaultSiteConfig, defaultThemeColors } from "@/types/siteConfig";
import { hairLuxuryTemplate, type TemplateDefinition } from "@/lib/templateLibrary";

const PREVIEW_SITE_ID = "builder-preview";

/** Reliable Unsplash assets for previews (avoid optional `/templates/hair/...` paths). */
const UNSPLASH_HAIR_HERO =
  "https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?w=1920&q=80";
const UNSPLASH_HAIR_ABOUT =
  "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&q=80";
const UNSPLASH_HAIR_WORK = [
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
  "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80",
  "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=800&q=80",
] as const;
const UNSPLASH_VOGUE_HERO =
  "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1920&q=80";
const UNSPLASH_VOGUE_ABOUT =
  "https://images.unsplash.com/photo-1519014816548-bf6898331664?w=1200&q=80";

export function getHairLuxuryBuilderPreviewPayload(): {
  config: SiteConfig;
  template: TemplateDefinition;
  siteId: string;
  services: SiteService[];
} {
  const services: SiteService[] = [
    { id: "p1", name: "תספורת מעצב", duration: 45, price: "₪180", enabled: true, sortOrder: 0 },
    { id: "p2", name: "צבע ופן", duration: 120, price: "₪450", enabled: true, sortOrder: 1 },
  ];
  const config: SiteConfig = {
    ...defaultSiteConfig,
    salonName: "סטודיו תצוגה",
    salonType: "hair",
    address: "תל אביב",
    heroImage: UNSPLASH_HAIR_HERO,
    aboutImage: UNSPLASH_HAIR_ABOUT,
    galleryImages: [...UNSPLASH_HAIR_WORK],
    themeColors: {
      ...defaultThemeColors,
      background: "#050816",
      surface: "#0f172a",
      text: "#f9fafb",
      mutedText: "#94a3b8",
      primary: "#e2b857",
      primaryText: "#0f172a",
      accent: "#e2b857",
      border: "#1e293b",
    },
    bookingOption: "booking_system",
    contactOptions: ["phone", "whatsapp"],
    mainGoals: ["online_booking"],
    extraPages: ["reviews", "faq"],
    publicSiteTemplateId: "hair-luxury",
    content: {
      ...(defaultSiteConfig.content ?? {}),
      hero: {
        tagline: "שיער · עיצוב · יוקרה",
        title: "המראה שתמיד רציתם",
        subtitle:
          "סטודיו תצוגה — צוות מקצועי, חומרים פרימיום וחוויית טיפוח אישית. התאמה מלאה לסגנון שלכם.",
        ctaPrimaryText: "קביעת תור",
        ctaSecondaryText: "גלו שירותים",
      },
      about: {
        headingLabel: "אודות",
        headingTitle: "החזון שלנו",
        body: "אנחנו מאמינים שכל אורח יוצא עם ביטחון מחודש. הסטודיו שלנו משלב אומנות, טכניקה עדכנית ויחס חם.",
        chip1: "ייעוץ אישי",
        chip2: "חומרים איכותיים",
        chip3: "תוצאה עמידה",
      },
    },
  };
  return { config, template: hairLuxuryTemplate, siteId: PREVIEW_SITE_ID, services };
}

export const BUILDER_BARBER_PREVIEW_SERVICES: SiteService[] = [
  { id: "b1", name: "תספורת חתימה", duration: 60, price: "₪240", enabled: true, sortOrder: 0 },
  { id: "b2", name: "גילוח מסורתי", duration: 45, price: "₪185", enabled: true, sortOrder: 1 },
];

export function getGentlemansBarberBuilderPreviewConfig(): SiteConfig {
  return {
    ...defaultSiteConfig,
    salonName: "מועדון הג׳נטלמן · תצוגה",
    salonType: "barber",
    publicSiteTemplateId: "gentlemans-barber",
    content: {
      ...(defaultSiteConfig.content ?? {}),
      hero: {
        tagline: "מאז 2019 · טיפוח פרימיום לגבר",
        title: "המועדון של הג׳נטלמן",
        subtitle:
          "תספורות מדויקות, גילוח חם ושירות ללא פשרות. בואו לחוויית ברברשופ אותנטית במרכז העיר.",
      },
    },
  };
}

export const BUILDER_VOGUE_PREVIEW_SERVICES: SiteService[] = [
  {
    id: "vn1",
    name: "לק ג׳ל",
    description: "טיפוח ידיים, גזירת קוטיקולה ולק ג׳ל עמיד.",
    duration: 60,
    price: "₪180",
    enabled: true,
    sortOrder: 0,
  },
  {
    id: "vn2",
    name: "פדיקור ספא",
    description: "פדיקור מלא עם שיוף, לחות ועיסוי קצר.",
    duration: 75,
    price: "₪220",
    enabled: true,
    sortOrder: 1,
  },
];

export function getVogueNailsBuilderPreviewConfig(): SiteConfig {
  return {
    ...defaultSiteConfig,
    salonName: "ווג ציפורניים · תצוגה",
    salonType: "nails",
    publicSiteTemplateId: "vogue-nails",
    address: "תל אביב",
    bookingOption: "booking_system",
    heroImage: UNSPLASH_VOGUE_HERO,
    aboutImage: UNSPLASH_VOGUE_ABOUT,
    galleryImages: [
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80",
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80",
    ],
    content: {
      ...(defaultSiteConfig.content ?? {}),
      hero: {
        tagline: "סטודיו לציפורניים",
        title: "ווג ציפורניים",
        subtitle:
          "מניקור, פדיקור ועיצוב ציפורניים — חוויית ספא נקייה ומוקפדת. כל הטקסטים ניתנים לעריכה מלוח הבקרה.",
      },
      about: {
        headingTitle: "החוויה שלנו",
        body: "אצלנו טיפוח הציפורניים הוא רגע של שקט ויופי. סטודיו נקי ומסודר — והכול ניתן לעדכון מלאה.",
      },
    },
  };
}
