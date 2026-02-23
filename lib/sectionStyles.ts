import type { SiteConfig, SectionStyles } from "@/types/siteConfig";
import { defaultThemeColors } from "@/types/siteConfig";

type ThemeKey = keyof typeof defaultThemeColors;

/** Fallback mapping: section key → themeColors key when section value is missing */
const SECTION_FALLBACKS: Record<string, Record<string, ThemeKey>> = {
  header: {
    bg: "surface",
    text: "primaryText",
    link: "primaryText",
    linkActive: "primaryText",
    linkHover: "primaryText",
    border: "border",
    primaryBtnBg: "primary",
    primaryBtnText: "primaryText",
  },
  hero: {
    bg: "background",
    text: "primaryText",
    subtitleText: "primaryText",
    overlayBg: "primary",
    primaryBtnBg: "primary",
    primaryBtnText: "primaryText",
    secondaryBtnBg: "surface",
    secondaryBtnText: "primaryText",
  },
  about: {
    bg: "background",
    titleText: "text",
    text: "mutedText",
    cardBg: "surface",
    cardText: "text",
    border: "border",
  },
  services: {
    bg: "background",
    titleText: "text",
    text: "mutedText",
    cardBg: "surface",
    cardText: "text",
    priceText: "mutedText",
    border: "border",
    chipBg: "surface",
    chipText: "text",
  },
  gallery: {
    bg: "background",
    titleText: "text",
    text: "mutedText",
    cardBg: "surface",
    border: "border",
  },
  faq: {
    bg: "surface",
    titleText: "text",
    text: "mutedText",
    itemBg: "surface",
    itemText: "text",
    itemBorder: "border",
  },
  reviews: {
    bg: "surface",
    titleText: "text",
    text: "mutedText",
    cardBg: "surface",
    cardText: "mutedText",
    starColor: "accent",
    border: "border",
  },
  map: {
    bg: "background",
    titleText: "text",
    text: "mutedText",
    cardBg: "surface",
    cardText: "text",
    border: "border",
    buttonBg: "primary",
    buttonText: "primaryText",
  },
  footer: {
    bg: "background",
    text: "mutedText",
    link: "text",
    linkHover: "accent",
    border: "border",
  },
  booking: {
    bg: "background",
    titleText: "text",
    cardBg: "surface",
    cardText: "text",
  },
};

/**
 * Get color for a section/key. Uses sectionStyles when set, otherwise themeColors fallback.
 * Existing sites without sectionStyles render exactly as before (themeColors only).
 */
export function getSectionColor(
  config: SiteConfig,
  section: keyof SectionStyles,
  key: string,
  fallbackKey?: ThemeKey
): string | undefined {
  const theme = config.themeColors ?? defaultThemeColors;
  const sectionObj = config.sectionStyles?.[section] as Record<string, string> | undefined;
  const value = sectionObj?.[key];
  if (value != null && value !== "") return value;
  const fk = fallbackKey ?? (SECTION_FALLBACKS[section] as Record<string, ThemeKey> | undefined)?.[key];
  if (fk && theme[fk] != null) return theme[fk];
  return undefined;
}

/**
 * Same as getSectionColor but always returns a string (uses defaultThemeColors as last resort).
 */
export function getSectionColorResolved(
  config: SiteConfig,
  section: keyof SectionStyles,
  key: string,
  fallbackKey?: ThemeKey
): string {
  const resolved = getSectionColor(config, section, key, fallbackKey);
  if (resolved != null) return resolved;
  const fk = fallbackKey ?? (SECTION_FALLBACKS[section] as Record<string, ThemeKey> | undefined)?.[key];
  const theme = config.themeColors ?? defaultThemeColors;
  if (fk) return theme[fk] ?? (defaultThemeColors[fk] as string);
  return (defaultThemeColors as Record<string, string>).text ?? "#0f172a";
}
