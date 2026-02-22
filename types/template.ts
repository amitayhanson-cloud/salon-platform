/**
 * Template document schema for Firestore collection: templates/{templateKey}
 * Templates define website presentation defaults only (theme, images, sections).
 * No tenant-specific data (bookings, clients, etc.).
 */

import type { SiteConfig } from "./siteConfig";

export type BusinessType = "hair" | "barber" | "nails" | "spa" | "mixed" | "other";

/** Partial SiteConfig - only presentation/branding defaults */
export type TemplateConfigDefaults = Partial<
  Pick<
    SiteConfig,
    | "themeColors"
    | "heroImage"
    | "aboutImage"
    | "dividerStyle"
    | "dividerHeight"
    | "extraPages"
    | "vibe"
    | "photosOption"
    | "contactOptions"
    | "mainGoals"
  >
>;

export interface TemplateDoc {
  /** e.g. "hair" */
  businessType: BusinessType;
  /** Presentation defaults to merge when creating a new site */
  configDefaults: TemplateConfigDefaults;
  /** Human-readable name for admin UI */
  displayName?: string;
  /** When this template was created/updated (for audit) */
  createdAt?: string;
  updatedAt?: string;
}

/** Firestore path: templates/{templateKey} e.g. templates/hair1 */
export const TEMPLATES_COLLECTION = "templates";

/** Default template key for hair salons */
export const DEFAULT_HAIR_TEMPLATE_KEY = "hair1";
