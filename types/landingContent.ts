/**
 * Content for the main platform landing page (Caleno).
 * Stored in Firestore at platform/landing; used by (main)/page and admin/landing.
 */

export type LandingHero = {
  headline: string;
  subheadline: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
};

export type LandingAbout = {
  title: string;
  body: string;
  ownershipLine: string;
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
  updatedAt?: unknown;
};
