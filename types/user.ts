import type { MainGoal } from "./siteConfig";

export type User = {
  id: string;
  /** Empty for phone-primary accounts (see primaryLoginMethod). */
  email: string;
  name?: string;
  /** E.164 or normalized phone; required for profile to be "complete" */
  phone?: string | null;
  /** Set for new phone+OTP signups; Google/email users may omit (legacy). */
  primaryLoginMethod?: "phone" | "email" | "google";
  siteId: string | null; // Primary / last-used site (null = no site yet, needs wizard)
  /** All sites this user owns; merged with siteId when reading if the array was missing. */
  ownedSiteIds?: string[];
  primarySlug?: string | null; // Tenant subdomain; prefer for dashboard links
  /** Saved from builder step "מה המטרה העיקרית של האתר" before site is created */
  onboardingMainGoals?: MainGoal[];
  /**
   * Phone for display on the public site, from builder step "איך לקוחות יכולים ליצור קשר".
   * Distinct from `phone` (account / signup phone).
   */
  onboardingSiteDisplayPhone?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

/** True when profile has name, phone, and (for non-phone-primary) email. */
export function isUserProfileComplete(user: User): boolean {
  const hasName = typeof user.name === "string" && user.name.trim().length > 0;
  const hasEmail = typeof user.email === "string" && user.email.trim().length > 0;
  const hasPhone = typeof user.phone === "string" && user.phone.trim().length > 0;
  if (!hasName || !hasPhone) return false;
  if (user.primaryLoginMethod === "phone") return true;
  return hasEmail;
}

export type SetupStatus = "not_started" | "in_progress" | "completed";

export type Website = {
  id: string;
  ownerUserId: string;
  templateId: string;
  subdomain: string; // e.g., "mysalon" -> mysalon.salonplatform.com
  customDomain?: string; // Optional custom domain
  setupStatus: SetupStatus; // Onboarding/setup state
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
};
