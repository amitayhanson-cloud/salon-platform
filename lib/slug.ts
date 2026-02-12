/**
 * Single source of truth for tenant subdomain slug validation.
 * Used by wizard, create/change tenant APIs, and tenant check API.
 */

/** Length bounds */
const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

/** Allowed: a-z, 0-9, hyphen (no leading/trailing; no consecutive: normalized input collapses hyphens). */
const SLUG_REGEX = /^[a-z0-9](?:-?[a-z0-9])*$/;

/** Normalized form: lowercase, trim, collapse consecutive hyphens to one, strip leading/trailing. */
function normalizeInput(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const RESERVED_SLUGS: string[] = [
  "www",
  "admin",
  "api",
  "login",
  "app",
  "mail",
  "support",
  "help",
  "static",
  "assets",
  "cdn",
  "dashboard",
  "docs",
  "billing",
  "settings",
  "auth",
  "oauth",
  "_next",
];

export type ValidateSlugOk = { ok: true; normalized: string };
export type ValidateSlugErr = { ok: false; error: string };
export type ValidateSlugResult = ValidateSlugOk | ValidateSlugErr;

/** Hebrew-friendly error messages for slug validation. */
const ERR_EMPTY = "נא להזין תת-דומיין.";
const ERR_LENGTH = `תת-דומיין חייב להיות בין ${MIN_LENGTH} ל-${MAX_LENGTH} תווים.`;
const ERR_CHARS = "מותר רק אותיות באנגלית (a-z), ספרות ומקף (ללא מקפים ברצף או בקצוות).";
const ERR_RESERVED = "תת-דומיין זה שמור במערכת.";

/**
 * Validates and normalizes a tenant slug.
 * Returns { ok: true, normalized } or { ok: false, error } with Hebrew message.
 */
export function validateSlug(slug: string): ValidateSlugResult {
  if (typeof slug !== "string") {
    return { ok: false, error: ERR_EMPTY };
  }
  const raw = slug.trim().toLowerCase();
  if (raw.startsWith("-") || raw.endsWith("-")) {
    return { ok: false, error: ERR_CHARS };
  }
  const normalized = normalizeInput(slug);
  if (!normalized) {
    return { ok: false, error: ERR_EMPTY };
  }
  if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
    return { ok: false, error: ERR_LENGTH };
  }
  if (!SLUG_REGEX.test(normalized)) {
    return { ok: false, error: ERR_CHARS };
  }
  if (RESERVED_SLUGS.includes(normalized)) {
    return { ok: false, error: ERR_RESERVED };
  }
  return { ok: true, normalized };
}

/**
 * Normalize slug for storage: lowercase, trim, collapse hyphens.
 * Use when you already know the input is valid or only need normalization.
 */
export function normalizeSlug(slug: string): string {
  return normalizeInput(slug);
}

/**
 * Returns true if the string is a valid slug format (length + regex).
 * Does not check reserved list.
 */
export function isValidSlugFormat(s: string): boolean {
  if (typeof s !== "string") return false;
  const n = normalizeInput(s);
  if (n.length < MIN_LENGTH || n.length > MAX_LENGTH) return false;
  return SLUG_REGEX.test(n);
}
