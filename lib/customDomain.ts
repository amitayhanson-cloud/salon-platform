/**
 * Custom domain: normalize, validate, and Firestore mapping.
 * domains/{domainKey} -> { siteId, domain, status, createdAt, updatedAt }
 * sites/{siteId} -> customDomain?, customDomainStatus?
 * Server-only (Firebase Admin) in API routes; middleware resolves via GET /api/tenants/resolve-domain.
 */

export type CustomDomainStatus =
  | "none"
  | "pending"
  | "verified"
  | "misconfigured"
  | "error"
  | "removing";

const INVALID_DOMAIN_CHARS = /[*:\/]/;
const DOMAIN_MAX_LEN = 253;

/**
 * Normalize domain for storage and lookup: trim, lowercase, no protocol, no path, no port, no trailing slash.
 * Use result as Firestore doc id in domains collection (safe: no / or *).
 */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.startsWith("http://")) s = s.slice(7);
  if (s.startsWith("https://")) s = s.slice(8);
  const pathIdx = s.indexOf("/");
  if (pathIdx !== -1) s = s.slice(0, pathIdx);
  const portIdx = s.indexOf(":");
  if (portIdx !== -1) s = s.slice(0, portIdx);
  s = s.replace(/\.+$/, ""); // trailing dots
  return s;
}

/**
 * Validate domain: not empty, no wildcard, no port, no path, reasonable length.
 * Returns normalized domain or error message.
 */
export function validateDomain(input: string): { ok: true; domain: string } | { ok: false; error: string } {
  const domain = normalizeDomain(input);
  if (!domain) return { ok: false, error: "נא להזין דומיין." };
  if (domain.length > DOMAIN_MAX_LEN) return { ok: false, error: "דומיין ארוך מדי." };
  if (INVALID_DOMAIN_CHARS.test(domain)) return { ok: false, error: "דומיין לא תקין (ללא *, :, /)." };
  // Basic hostname: at least one dot or single label (e.g. localhost)
  const labels = domain.split(".");
  if (labels.some((l) => !l.length)) return { ok: false, error: "דומיין לא תקין." };
  return { ok: true, domain };
}

/** Safe Firestore document id for domains collection (normalized domain as-is; no / or *) */
export function domainDocId(normalizedDomain: string): string {
  return normalizedDomain;
}
