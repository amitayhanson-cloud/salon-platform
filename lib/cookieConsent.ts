/**
 * Cookie consent: versioned storage so we only re-prompt when the policy is updated.
 *
 * Bump COOKIE_CONSENT_VERSION when:
 * - Cookie usage or purposes change
 * - Privacy/cookie policy is updated in a way that requires renewed consent
 *
 * Users who agreed to the previous version will see the banner again until they
 * accept or decline the new version.
 */
export const COOKIE_CONSENT_NAME = "caleno_cookie_consent";
export const COOKIE_CONSENT_VERSION = 1;

export type CookieConsentChoice = "accepted" | "essential";

/** Value stored in cookie: "version:choice" e.g. "1:accepted" */
function getCookieValue(version: number, choice: CookieConsentChoice): string {
  return `${version}:${choice}`;
}

function parseCookieValue(value: string): { version: number; choice: CookieConsentChoice } | null {
  const parts = value.trim().split(":");
  if (parts.length !== 2) return null;
  const version = parseInt(parts[0]!, 10);
  const choice = parts[1] as CookieConsentChoice;
  if (isNaN(version) || (choice !== "accepted" && choice !== "essential")) return null;
  return { version, choice };
}

/** Get consent cookie (client-only). Returns null if not set or invalid. */
export function getCookieConsent(): { version: number; choice: CookieConsentChoice } | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_CONSENT_NAME}=`));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(COOKIE_CONSENT_NAME.length + 1).trim());
  return parseCookieValue(value);
}

/** Returns true if user has already made a choice for the current version. */
export function hasValidCookieConsent(): boolean {
  const stored = getCookieConsent();
  if (!stored) return false;
  return stored.version === COOKIE_CONSENT_VERSION;
}

/** Set consent cookie. Secure, SameSite=Lax, 1 year. */
export function setCookieConsent(choice: CookieConsentChoice): void {
  if (typeof document === "undefined") return;
  const value = getCookieValue(COOKIE_CONSENT_VERSION, choice);
  const maxAge = 365 * 24 * 60 * 60;
  const secure = typeof window !== "undefined" && window.location?.protocol === "https:";
  let cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  if (secure) cookie += "; Secure";
  document.cookie = cookie;
}
