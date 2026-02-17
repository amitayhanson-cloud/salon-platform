"use client";

import { HeroGeometric } from "@/components/hero/HeroGeometric";

/**
 * Full-page fixed geometric background matching the main Caleno landing hero.
 * Same gradients, shapes, and styling. Use behind landing or admin shell.
 * Renders fixed behind content (z-index below content); does not scroll.
 */
export function HeroBackground() {
  return <HeroGeometric backgroundOnly fixed />;
}
