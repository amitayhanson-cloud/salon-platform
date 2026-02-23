/**
 * Combined platform template images for the "מאגר הפלטפורמה" picker.
 * Builds a single list from hero, about, work (and any other folders) with group labels.
 * All URLs are under /public/templates/ (served at /templates/...).
 */

export type PlatformTemplateImage = {
  url: string;
  group: string;
  name: string;
};

const GROUP_ORDER = ["hero", "about", "work"] as const;

/** Explicit filenames per folder for hair template (no filesystem access at runtime). */
const HAIR_TEMPLATE = {
  hero: ["hero1.jpg", "hero2.jpg", "hero3.jpg"],
  about: ["about1.jpg", "about2.jpg", "about3.jpg", "about4.jpg", "about5.jpg"],
  work: (() => {
    const names: string[] = [];
    for (let i = 4; i <= 28; i++) names.push(`work${i}.jpg`);
    return names;
  })(),
} as const;

function buildItems(templateId: string, groups: Record<string, readonly string[]>): PlatformTemplateImage[] {
  const seen = new Set<string>();
  const items: PlatformTemplateImage[] = [];
  const base = `/templates/${templateId}`;
  for (const group of GROUP_ORDER) {
    const files = groups[group];
    if (!files) continue;
    const groupBase = `${base}/${group}`;
    for (const name of files) {
      const url = `${groupBase}/${name}`;
      if (typeof url !== "string" || !url.startsWith("/") || seen.has(url)) continue;
      seen.add(url);
      items.push({ url, group, name });
    }
  }
  return items.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group as (typeof GROUP_ORDER)[number]);
    const gb = GROUP_ORDER.indexOf(b.group as (typeof GROUP_ORDER)[number]);
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/** Returns all platform template images for the picker grid. Deduped, sorted by group (hero, about, work) then name. */
export function getPlatformTemplateImages(templateId: "hair" | "salon" | string): PlatformTemplateImage[] {
  if (templateId === "hair") {
    return buildItems("hair", HAIR_TEMPLATE);
  }
  return [];
}

const GROUP_LABELS: Record<string, string> = {
  hero: "Hero",
  about: "About",
  work: "Work",
};

/** Human-readable label for a group (for badge). */
export function getPlatformGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}
