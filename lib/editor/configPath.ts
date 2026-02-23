import type { SiteConfig } from "@/types/siteConfig";

/**
 * Get a value from site config by dot path (e.g. "themeColors.primary", "content.hero.title", "faqs.0.question").
 * Supports array indices (e.g. "faqs.0.question").
 */
export function getByPath(config: SiteConfig, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = config;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    const obj = current as Record<string, unknown>;
    current = obj[p];
  }
  return current;
}

/**
 * Set a value at path and return a new config object (immutable update).
 * Creates nested objects when missing. Supports array indices (e.g. "faqs.0.question").
 */
export function setByPath(
  config: SiteConfig,
  path: string,
  value: unknown
): SiteConfig {
  const parts = path.split(".");
  if (parts.length === 1) {
    return { ...config, [path]: value } as SiteConfig;
  }
  const key = parts[0]!;
  const rest = parts.slice(1).join(".");
  const current = (config as Record<string, unknown>)[key];
  let next: unknown;
  if (rest) {
    const restParts = parts.slice(1);
    const isArrayIndex = restParts.length > 0 && /^\d+$/.test(restParts[0]!);
    if (Array.isArray(current) && isArrayIndex) {
      const idx = parseInt(restParts[0]!, 10);
      const restAfterIndex = restParts.slice(1).join(".");
      const arr = [...current];
      const existing = arr[idx];
      const base =
        typeof existing === "object" && existing !== null && !Array.isArray(existing)
          ? (existing as Record<string, unknown>)
          : {};
      const updated =
        restAfterIndex
          ? setByPath(base as SiteConfig, restAfterIndex, value)
          : value;
      if (idx >= arr.length) {
        for (let i = arr.length; i < idx; i++) arr.push(undefined as unknown);
      }
      arr[idx] = updated;
      next = arr;
    } else {
      const base =
        typeof current === "object" && current !== null && !Array.isArray(current)
          ? (current as Record<string, unknown>)
          : {};
      next = setByPath(base as SiteConfig, rest, value);
    }
  } else {
    next = value;
  }
  return { ...config, [key]: next } as SiteConfig;
}
