/**
 * Content for the main platform landing page (Caleno).
 * Stored in Firestore at platform/landing; used by (main)/page and admin/landing.
 */

export type LandingHero = {
  headline: string;
  subheadline: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  /** URL of hero image (product screenshot). */
  imageUrl?: string;
};

export type LandingAbout = {
  title: string;
  body: string;
  ownershipLine: string;
  /** URL of about section image. */
  imageUrl?: string;
};

/** Optional image URLs for feature/demo sections. */
export type LandingFeaturesImages = {
  /** Demo tab 1: יומן תורים. */
  calendarImageUrl?: string;
  /** Demo tab 2: לקוחות. */
  clientsImageUrl?: string;
  /** Demo tab 3: אוטומציות WhatsApp. */
  whatsappImageUrl?: string;
  /** Product explanation section (second section). */
  websitePreviewImageUrl?: string;
};

export type LandingHowStep = {
  title: string;
  description: string;
};

export type LandingFaqItem = {
  question: string;
  answer: string;
};

export type LandingContent = {
  hero: LandingHero;
  about: LandingAbout;
  how: LandingHowStep[];
  faq: LandingFaqItem[];
  /** Section images (features, product demo, etc.). */
  features?: LandingFeaturesImages;
  updatedAt?: unknown;
};
