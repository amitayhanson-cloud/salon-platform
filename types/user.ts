import type { MainGoal } from "./siteConfig";

export type User = {
  id: string;
  email: string;
  name?: string;
  /** E.164 or normalized phone; required for profile to be "complete" */
  phone?: string | null;
  siteId: string | null; // Reference to the user's site (null = no site yet, needs wizard)
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

/** True when user has name, email, and phone (needed before builder/site creation). */
export function isUserProfileComplete(user: User): boolean {
  const hasName = typeof user.name === "string" && user.name.trim().length > 0;
  const hasEmail = typeof user.email === "string" && user.email.trim().length > 0;
  const hasPhone = typeof user.phone === "string" && user.phone.trim().length > 0;
  return hasName && hasEmail && hasPhone;
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
