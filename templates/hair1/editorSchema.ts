/**
 * Editor schema for hair1 template.
 * Defines which elements are selectable and what can be edited (colors, images).
 * To add a new template: create templates/{templateKey}/editorSchema.ts and
 * register it in the editor's template schema map.
 */

export type EditableTargetType = "section" | "image" | "color" | "button" | "text" | "container";

export type EditablePath =
  | `themeColors.${string}`
  | `sectionStyles.${string}`
  | `content.${string}`
  | `faqs.${string}`
  | `heroImage`
  | `aboutImage`;

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
  // Global / root
  {
    id: "globalColors",
    label: "צבעים גלובליים",
    selectorId: "globalColors",
    type: "section",
    editablePaths: [
      "themeColors.background",
      "themeColors.surface",
      "themeColors.text",
      "themeColors.mutedText",
      "themeColors.primary",
      "themeColors.primaryText",
      "themeColors.accent",
      "themeColors.border",
    ],
  },
  // Header (granular)
  {
    id: "header",
    label: "כותרת עליונה",
    selectorId: "header",
    type: "section",
    editablePaths: ["themeColors.primary", "themeColors.primaryText"],
  },
  {
    id: "headerBg",
    label: "רקע כותרת",
    selectorId: "headerBg",
    type: "color",
    editablePaths: ["themeColors.primary", "themeColors.surface"],
  },
  {
    id: "headerText",
    label: "שם הסלון בכותרת",
    selectorId: "headerText",
    type: "text",
    editablePaths: ["content.header.brandName", "themeColors.primaryText", "themeColors.text"],
  },
  {
    id: "headerNavLink",
    label: "קישורי ניווט",
    selectorId: "headerNavLink",
    type: "color",
    editablePaths: ["themeColors.primaryText", "themeColors.text"],
  },
  {
    id: "headerCtaButton",
    label: "כפתור קביעת תור בכותרת",
    selectorId: "headerCtaButton",
    type: "button",
    editablePaths: ["themeColors.primary", "themeColors.primaryText"],
  },
  // Hero
  {
    id: "hero",
    label: "הירו",
    selectorId: "hero",
    type: "section",
    editablePaths: [
      "themeColors.primary",
      "themeColors.primaryText",
      "themeColors.accent",
      "heroImage",
    ],
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
    editablePaths: ["content.hero.tagline", "themeColors.primaryText"],
  },
  {
    id: "heroTitle",
    label: "כותרת הירו",
    selectorId: "heroTitle",
    type: "text",
    editablePaths: ["content.hero.title", "themeColors.primaryText", "themeColors.text"],
  },
  {
    id: "heroSubtitle",
    label: "תת־כותרת הירו",
    selectorId: "heroSubtitle",
    type: "text",
    editablePaths: ["content.hero.subtitle", "themeColors.primaryText"],
  },
  {
    id: "heroButtonPrimary",
    label: "כפתור ראשי (קבעי תור)",
    selectorId: "heroButtonPrimary",
    type: "button",
    editablePaths: ["content.hero.ctaPrimaryText", "themeColors.primary", "themeColors.primaryText"],
  },
  {
    id: "heroButtonSecondary",
    label: "כפתור משני (צור קשר)",
    selectorId: "heroButtonSecondary",
    type: "button",
    editablePaths: ["content.hero.ctaSecondaryText", "themeColors.primary", "themeColors.primaryText", "themeColors.accent"],
  },
  // About
  {
    id: "about",
    label: "אודות",
    selectorId: "about",
    type: "section",
    editablePaths: [
      "themeColors.text",
      "themeColors.mutedText",
      "themeColors.accent",
      "aboutImage",
    ],
  },
  {
    id: "aboutHeading",
    label: "כותרת אודות",
    selectorId: "aboutHeading",
    type: "text",
    editablePaths: ["content.about.headingLabel", "content.about.headingTitle", "themeColors.accent", "themeColors.text"],
  },
  {
    id: "aboutBody",
    label: "טקסט אודות",
    selectorId: "aboutBody",
    type: "text",
    editablePaths: ["content.about.body", "themeColors.text", "themeColors.mutedText"],
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
    editablePaths: ["content.about.chip1", "content.about.chip2", "content.about.chip3", "themeColors.surface", "themeColors.border", "themeColors.text"],
  },
  // Services
  {
    id: "services",
    label: "שירותים",
    selectorId: "services",
    type: "section",
    editablePaths: [
      "themeColors.primary",
      "themeColors.primaryText",
      "themeColors.surface",
      "themeColors.border",
      "themeColors.text",
      "themeColors.mutedText",
    ],
  },
  {
    id: "servicesHeading",
    label: "כותרת שירותים",
    selectorId: "servicesHeading",
    type: "text",
    editablePaths: ["content.services.sectionTitle", "content.services.sectionSubtitle", "themeColors.text", "themeColors.mutedText"],
  },
  {
    id: "serviceCard",
    label: "כרטיס שירות",
    selectorId: "serviceCard",
    type: "container",
    editablePaths: [
      "themeColors.surface",
      "themeColors.border",
      "themeColors.primary",
      "themeColors.primaryText",
      "themeColors.text",
      "themeColors.mutedText",
    ],
  },
  // Gallery
  {
    id: "galleryHeading",
    label: "כותרת גלריה",
    selectorId: "galleryHeading",
    type: "text",
    editablePaths: ["content.gallery.title", "content.gallery.subtitle", "themeColors.text", "themeColors.mutedText"],
  },
  // FAQ (per-item paths come from DOM: faqs.0.question, faqs.0.answer)
  {
    id: "faqSectionTitle",
    label: "כותרת שאלות נפוצות",
    selectorId: "faqSectionTitle",
    type: "text",
    editablePaths: ["content.faq.sectionTitle", "content.faq.sectionSubtitle", "themeColors.text"],
  },
  {
    id: "faqItem",
    label: "שאלה/תשובה FAQ",
    selectorId: "faqItem",
    type: "text",
    editablePaths: [],
  },
  // Reviews
  {
    id: "reviewsHeading",
    label: "כותרת המלצות",
    selectorId: "reviewsHeading",
    type: "text",
    editablePaths: ["content.reviews.sectionLabel", "content.reviews.sectionTitle", "themeColors.text"],
  },
  // Map
  {
    id: "mapPlaceholder",
    label: "טקסט מפה",
    selectorId: "mapPlaceholder",
    type: "text",
    editablePaths: ["content.map.title", "content.map.placeholderText", "themeColors.text"],
  },
  // Footer
  {
    id: "footerCopyright",
    label: "זכויות יוצרים בפוטר",
    selectorId: "footerCopyright",
    type: "text",
    editablePaths: ["content.footer.copyright", "themeColors.mutedText"],
  },
];

export function getEditableTargetBySelectorId(
  selectorId: string
): EditableTarget | undefined {
  return hair1EditorSchema.find((t) => t.selectorId === selectorId);
}
