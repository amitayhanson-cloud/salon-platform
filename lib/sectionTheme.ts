import type { SiteConfig, SectionStyles } from "@/types/siteConfig";
import { getSectionColor, getSectionColorResolved } from "@/lib/sectionStyles";

export type SectionKey = keyof SectionStyles;

/**
 * Get raw section overrides for a section (no fallbacks).
 * Use for editor state; use pickColor/getSectionColorResolved for rendering.
 */
export function getSectionStyle(
  config: SiteConfig,
  section: SectionKey
): Record<string, string> {
  const obj = config.sectionStyles?.[section];
  if (obj == null || typeof obj !== "object") return {};
  return obj as Record<string, string>;
}

/**
 * Get color for section/key with custom fallback.
 * sectionStyles[section][key] ?? fallbackFn()
 */
export function pickColor(
  config: SiteConfig,
  section: SectionKey,
  key: string,
  fallbackFn: () => string
): string {
  const value = getSectionColor(config, section, key);
  if (value != null && value !== "") return value;
  return fallbackFn();
}

/** Section background (bg → themeColors.background/surface per section fallbacks). */
export function sectionBg(config: SiteConfig, section: SectionKey): string {
  return getSectionColorResolved(config, section, "bg");
}

/** Section body text. */
export function sectionText(config: SiteConfig, section: SectionKey): string {
  return getSectionColorResolved(config, section, "text");
}

/** Section title/heading text. */
export function sectionTitle(config: SiteConfig, section: SectionKey): string {
  return getSectionColorResolved(config, section, "titleText");
}

/** Card background within section. */
export function sectionCardBg(config: SiteConfig, section: SectionKey): string {
  return getSectionColorResolved(config, section, "cardBg");
}

/** Section border color. */
export function sectionBorder(config: SiteConfig, section: SectionKey): string {
  return getSectionColorResolved(config, section, "border");
}
