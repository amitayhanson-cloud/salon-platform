"use client";

import CalenoLoader from "@/components/ui/CalenoLoader";

/**
 * Full-page Caleno logo loading animation.
 * Uses the water loader (orbital arcs, logo, ripples, wave bar) everywhere.
 * Used site-wide for route loading and auth/data loading states.
 */
export default function CalenoLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <CalenoLoader />
    </div>
  );
}
