"use client";

import type { ReactNode } from "react";
import type { SiteConfig } from "@/types/siteConfig";
import { themePaletteRootStyle } from "@/lib/themePalette";
import { cn } from "@/lib/utils";

/**
 * Injects Caleno theme CSS variables (same as live {@link SiteRenderer} hair branch)
 * so {@link HairLuxurySite} previews render with correct colors inside the phone mockup.
 */
export function SiteThemeVariablesRoot({
  config,
  className,
  children,
}: {
  config: SiteConfig;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)} style={themePaletteRootStyle(config)}>
      {children}
    </div>
  );
}
