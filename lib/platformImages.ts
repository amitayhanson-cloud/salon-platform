/**
 * Platform / template images shipped with the codebase (static assets under /public/templates).
 * All paths are local, start with "/", and match files in public/templates/.
 * Used by the image picker "מאגר הפלטפורמה" tab.
 * Gallery and service use /templates/hair/work/ (work4.jpg..work28.jpg).
 */

const HAIR_WORK_BASE = "/templates/hair/work";

/** work4.jpg through work28.jpg — matches existing files under public/templates/hair/work/ */
const HAIR_WORK_GALLERY: readonly string[] = (() => {
  const urls: string[] = [];
  for (let i = 4; i <= 28; i++) urls.push(`${HAIR_WORK_BASE}/work${i}.jpg`);
  return urls;
})();

export const PLATFORM_IMAGES = {
  hair: {
    hero: [
      "/templates/hair/hero/hero1.jpg",
      "/templates/hair/hero/hero2.jpg",
      "/templates/hair/hero/hero3.jpg",
    ],
    about: [
      "/templates/hair/about/about1.jpg",
      "/templates/hair/about/about2.jpg",
      "/templates/hair/about/about3.jpg",
      "/templates/hair/about/about4.jpg",
      "/templates/hair/about/about5.jpg",
    ],
    /** Gallery and service both use hair/work work4..work28 only (no salon paths). */
    gallery: HAIR_WORK_GALLERY,
    service: HAIR_WORK_GALLERY,
  },
} as const;

export type PlatformImageCategory = keyof typeof PLATFORM_IMAGES.hair;

/** Keep only valid platform image URLs: non-empty and start with "/". */
function filterValidUrls(urls: readonly string[]): string[] {
  return urls.filter((u): u is string => typeof u === "string" && u.trim() !== "" && u.trim().startsWith("/"));
}

/** Returns platform image URLs for the given target path. Uses hair only; valid URLs only. */
export function getPlatformImagesForTarget(targetPath: string): readonly string[] {
  const hero = filterValidUrls(PLATFORM_IMAGES.hair.hero);
  const about = filterValidUrls(PLATFORM_IMAGES.hair.about);
  const gallery = filterValidUrls(PLATFORM_IMAGES.hair.gallery);
  const service = filterValidUrls(PLATFORM_IMAGES.hair.service);

  if (targetPath === "heroImage") return hero;
  if (targetPath === "aboutImage") return about;
  if (targetPath.startsWith("galleryImages.")) return gallery;
  if (targetPath === "serviceImage") return service;
  return hero;
}
