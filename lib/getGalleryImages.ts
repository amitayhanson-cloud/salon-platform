import type { SiteConfig } from "@/types/siteConfig";

/**
 * Returns the gallery image URLs to display.
 * - If config.galleryImages exists and has at least one valid URL → use those (filtered to truthy strings).
 * - If missing or empty → return template defaults so new sites still look good.
 * Layout, style, and behavior stay in the template; only the image list is driven by config.
 */
export function getGalleryImages(
  config: SiteConfig | null | undefined,
  templateDefaults: string[]
): string[] {
  const raw = config?.galleryImages;
  if (!Array.isArray(raw)) return templateDefaults;
  const valid = raw.filter(
    (url): url is string => typeof url === "string" && url.trim() !== ""
  );
  if (valid.length >= 1) return valid;
  return templateDefaults;
}
