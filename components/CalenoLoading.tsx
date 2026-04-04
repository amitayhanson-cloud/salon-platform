"use client";

import { LiquidGlassLoading } from "@/components/landing-v2/liquid-glass-loading";

/**
 * Caleno loading art + spin for panels and data states.
 * Full-route loading uses the same asset via `LiquidGlassLoading` fullscreen.
 */
export default function CalenoLoading() {
  return <LiquidGlassLoading variant="inline" />;
}
