/**
 * Editor schema for hair1 template.
 * Defines which elements are selectable for text/images. Colors use centralized themePalette (Theme panel).
 */

export type EditableTargetType = "section" | "image" | "color" | "button" | "text" | "container";

export type EditablePath =
  | `themePalette.${string}`
  | `content.${string}`
  | `faqs.${string}`
  | `heroImage`
  | `aboutImage`
  | "galleryImages"
  | "branding.logoUrl";

export interface EditableTarget {
  id: string;
  label: string;
  /** Matches data-edit-id on the component */
  selectorId: string;
  type: EditableTargetType;
  /** Config paths this target can edit */
  editablePaths: EditablePath[];
}

export const hair1EditorSchema: EditableTarget[] = [
  {
    id: "header",
    label: "כותרת עליונה",
    selectorId: "header",
    type: "section",
    editablePaths: [],
  },
  {
    id: "headerText",
    label: "שם הסלון בכותרת",
    selectorId: "headerText",
    type: "text",
    editablePaths: ["content.header.brandName", "branding.logoUrl"],
  },
  {
    id: "headerNavLink",
    label: "קישורי ניווט",
    selectorId: "headerNavLink",
    type: "text",
    editablePaths: [],
  },
  {
    id: "headerCtaButton",
    label: "כפתור קביעת תור בכותרת",
    selectorId: "headerCtaButton",
    type: "button",
    editablePaths: ["content.header.navCtaBook", "content.header.navCtaContact"],
  },
  {
    id: "hero",
    label: "הירו",
    selectorId: "hero",
    type: "section",
    editablePaths: ["heroImage"],
  },
  {
    id: "heroImage",
    label: "תמונת הירו",
    selectorId: "heroImage",
    type: "image",
    editablePaths: ["heroImage"],
  },
  {
    id: "heroTagline",
    label: "תגית הירו",
    selectorId: "heroTagline",
    type: "text",
    editablePaths: ["content.hero.tagline"],
  },
  {
    id: "heroTitle",
    label: "כותרת הירו",
    selectorId: "heroTitle",
    type: "text",
    editablePaths: ["content.hero.title"],
  },
  {
    id: "heroSubtitle",
    label: "תת־כותרת הירו",
    selectorId: "heroSubtitle",
    type: "text",
    editablePaths: ["content.hero.subtitle"],
  },
  {
    id: "heroButtonPrimary",
    label: "כפתור ראשי (קבעי תור)",
    selectorId: "heroButtonPrimary",
    type: "button",
    editablePaths: ["content.hero.ctaPrimaryText"],
  },
  {
    id: "heroButtonSecondary",
    label: "כפתור משני (צור קשר)",
    selectorId: "heroButtonSecondary",
    type: "button",
    editablePaths: ["content.hero.ctaSecondaryText"],
  },
  {
    id: "about",
    label: "אודות",
    selectorId: "about",
    type: "section",
    editablePaths: ["aboutImage"],
  },
  {
    id: "aboutHeading",
    label: "כותרת אודות",
    selectorId: "aboutHeading",
    type: "text",
    editablePaths: ["content.about.headingLabel", "content.about.headingTitle"],
  },
  {
    id: "aboutBody",
    label: "טקסט אודות",
    selectorId: "aboutBody",
    type: "text",
    editablePaths: ["content.about.body"],
  },
  {
    id: "aboutImage",
    label: "תמונת אודות",
    selectorId: "aboutImage",
    type: "image",
    editablePaths: ["aboutImage"],
  },
  {
    id: "aboutChips",
    label: "תגיות אודות",
    selectorId: "aboutChips",
    type: "container",
    editablePaths: ["content.about.chip1", "content.about.chip2", "content.about.chip3"],
  },
  {
    id: "services",
    label: "שירותים",
    selectorId: "services",
    type: "section",
    editablePaths: [],
  },
  {
    id: "servicesHeading",
    label: "כותרת שירותים",
    selectorId: "servicesHeading",
    type: "text",
    editablePaths: ["content.services.sectionTitle", "content.services.sectionSubtitle"],
  },
  {
    id: "serviceCard",
    label: "כרטיס שירות",
    selectorId: "serviceCard",
    type: "container",
    editablePaths: [],
  },
  {
    id: "serviceCardImage",
    label: "תמונת שירות",
    selectorId: "serviceCardImage",
    type: "image",
    editablePaths: [],
  },
  {
    id: "gallery",
    label: "גלריה",
    selectorId: "gallery",
    type: "section",
    editablePaths: ["galleryImages"],
  },
  {
    id: "galleryHeading",
    label: "כותרת גלריה",
    selectorId: "galleryHeading",
    type: "text",
    editablePaths: ["content.gallery.title", "content.gallery.subtitle"],
  },
  {
    id: "faqSectionTitle",
    label: "כותרת שאלות נפוצות",
    selectorId: "faqSectionTitle",
    type: "text",
    editablePaths: ["content.faq.sectionTitle", "content.faq.sectionSubtitle"],
  },
  {
    id: "faqItem",
    label: "שאלה/תשובה FAQ",
    selectorId: "faqItem",
    type: "text",
    editablePaths: [],
  },
  {
    id: "reviews",
    label: "המלצות",
    selectorId: "reviews",
    type: "section",
    editablePaths: [],
  },
  {
    id: "reviewsHeading",
    label: "כותרת המלצות",
    selectorId: "reviewsHeading",
    type: "text",
    editablePaths: ["content.reviews.sectionLabel", "content.reviews.sectionTitle"],
  },
  {
    id: "map",
    label: "מפה וקשר",
    selectorId: "map",
    type: "section",
    editablePaths: [],
  },
  {
    id: "mapPlaceholder",
    label: "טקסט מפה",
    selectorId: "mapPlaceholder",
    type: "text",
    editablePaths: ["content.map.title", "content.map.placeholderText"],
  },
  {
    id: "footer",
    label: "פוטר",
    selectorId: "footer",
    type: "section",
    editablePaths: [],
  },
  {
    id: "footerCopyright",
    label: "זכויות יוצרים בפוטר",
    selectorId: "footerCopyright",
    type: "text",
    editablePaths: ["content.footer.copyright"],
  },
];

export function getEditableTargetBySelectorId(
  selectorId: string
): EditableTarget | undefined {
  return hair1EditorSchema.find((t) => t.selectorId === selectorId);
}
