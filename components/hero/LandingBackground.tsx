"use client";

import { HeroGeometric } from "./HeroGeometric";

/**
 * Full-page fixed geometric background for the main Caleno platform landing page.
 * Renders behind all sections (hero, features, pricing, etc.) and remains visible on scroll.
 * Only use inside the (main) layout — not on tenant sites, booking pages, or dashboards.
 */
export function LandingBackground() {
    return <HeroGeometric backgroundOnly fixed />;
}
