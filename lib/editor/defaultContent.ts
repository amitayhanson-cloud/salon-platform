import type { SiteContent } from "@/types/siteConfig";

/**
 * Default editable text content for the website preview.
 * Used when config.content is missing or a key is missing.
 * Preview reads: config.content?.section?.key ?? DEFAULT_CONTENT.section.key
 */
export const DEFAULT_CONTENT: Required<SiteContent> = {
  header: {
    brandName: "",
    navAbout: "אודות",
    navServices: "שירותים",
    navGallery: "גלריה",
    navShop: "חנות",
    navCtaBook: "קביעת תור",
    navCtaContact: "צור קשר",
  },
  hero: {
    tagline: "סלון יופי • עיצוב שיער",
    title: "עיצוב שיער ברמה אחרת",
    subtitle:
      "צוות מקצועי עם ניסיון רב, התאמה אישית לכל לקוחה ותוצאה שמחזיקה לאורך זמן.",
    ctaPrimaryText: "קביעת תור",
    ctaSecondaryText: "יצירת קשר",
  },
  about: {
    headingLabel: "על הסלון",
    headingTitle: "על הסלון",
    body: "הסלון הוא סלון שיער בוטיק המתמחה בתספורות מדויקות, צבעי שיער מתקדמים וטיפולי פרימיום לשיקום וחיזוק השיער.\n\nצוות מקצועי, אווירה אינטימית ושימת לב לכל פרט קטן – כדי שכל לקוחה תצא עם תחושת לוקס אמיתית.",
    chip1: "+15 שנות ניסיון",
    chip2: "אווירה פרטית ומוקפדת",
    chip3: "חומרים פרימיום בלבד",
  },
  services: {
    sectionTitle: "השירותים שלנו",
    sectionSubtitle:
      "כל שירות מבוצע בקפידה על ידי צוות מקצועי ומנוסה, תוך שימוש בחומרים איכותיים וטכניקות מתקדמות.",
  },
  gallery: {
    title: "גלריית עבודות",
    subtitle: "מבחר קטן מהעבודות והאווירה בסלון.",
  },
  faq: {
    sectionTitle: "שאלות נפוצות",
    sectionSubtitle: "כל מה שרציתם לדעת",
  },
  reviews: {
    sectionLabel: "מה הלקוחות אומרים",
    sectionTitle: "המלצות מלקוחות מרוצים",
  },
  map: {
    title: "",
    placeholderText: "כאן תופיע מפה אינטראקטיבית (Google Maps / Waze)",
  },
  products: {
    sectionTitle: "מוצרים נבחרים",
    sectionSubtitle: "מבחר פריטים איכותיים מהסלון — זמינים לצפייה ולהזמנה.",
  },
  footer: {
    copyright: "נבנה ב-Caleno",
  },
};

/** Get content value: config.content?.section?.key ?? DEFAULT_CONTENT.section.key */
export function getContentValue(
  content: SiteContent | undefined,
  section: keyof SiteContent,
  key: string
): string {
  const sectionContent = content?.[section] as Record<string, string> | undefined;
  const value = sectionContent?.[key];
  if (value != null && typeof value === "string") return value;
  const defaults = DEFAULT_CONTENT[section] as Record<string, string> | undefined;
  return defaults?.[key] ?? "";
}
