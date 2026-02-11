/**
 * Main platform admin: who can access /admin and /admin/landing.
 * Default admin: amitayhanson@gmail.com
 * Override via NEXT_PUBLIC_LANDING_ADMIN_EMAILS (comma-separated).
 */

const DEFAULT_ADMIN_EMAIL = "amitayhanson@gmail.com";

function getAdminEmails(): string[] {
  if (typeof process === "undefined") return [DEFAULT_ADMIN_EMAIL];
  const env = process.env.NEXT_PUBLIC_LANDING_ADMIN_EMAILS?.trim();
  if (!env) return [DEFAULT_ADMIN_EMAIL];
  return env
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_EMAILS = getAdminEmails();

export function isPlatformAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
