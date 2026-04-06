import type { SiteConfig, SectionStyles } from "@/types/siteConfig";
import { resolveSectionSemanticColor } from "@/lib/themePalette";

/**
 * Get color for a section/key. Uses sectionStyles when set; otherwise centralized theme palette.
 */
export function getSectionColor(
  config: SiteConfig,
  section: keyof SectionStyles,
  key: string
): string | undefined {
  const sectionObj = config.sectionStyles?.[section] as Record<string, string> | undefined;
  const value = sectionObj?.[key];
  if (value != null && value !== "") return value;
  return undefined;
}

/**
 * Resolved color for rendering (section override or semantic palette).
 */
export function getSectionColorResolved(
  config: SiteConfig,
  section: keyof SectionStyles,
  key: string
): string {
  const resolved = getSectionColor(config, section, key);
  if (resolved != null) return resolved;
  return resolveSectionSemanticColor(config, section, key);
}
