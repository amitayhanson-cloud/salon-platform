import type { CSSProperties } from "react";
import type { SiteConfig } from "@/types/siteConfig";
import { getTextColorHex } from "@/lib/colorUtils";
import { adjustHexLightness, hexToHslSpaceSeparated } from "@/lib/hexColor";
import { getSectionColorResolved } from "@/lib/sectionStyles";
import { resolveVisualTheme } from "@/lib/themePalette";

/**
 * Maps centralized palette + optional header overrides into `.gents-barber-root` (HSL triplets).
 */
export function barberCssVarsFromConfig(config: SiteConfig): CSSProperties {
  const v = resolveVisualTheme(config);
  const primaryGlow = adjustHexLightness(v.primary, 12);
  const headerBgHex = getSectionColorResolved(config, "header", "bg");
  const headerBrandHex = getSectionColorResolved(config, "header", "text");
  const headerLinkHex = getSectionColorResolved(config, "header", "link");
  const headerCtaBgHex = getSectionColorResolved(config, "header", "primaryBtnBg");
  const headerCtaTextHex = getSectionColorResolved(config, "header", "primaryBtnText");

  return {
    "--background": hexToHslSpaceSeparated(v.background),
    "--charcoal": hexToHslSpaceSeparated(headerBgHex),
    "--foreground": hexToHslSpaceSeparated(v.foreground),
    "--card": hexToHslSpaceSeparated(v.surface),
    "--card-foreground": hexToHslSpaceSeparated(v.foreground),
    "--primary": hexToHslSpaceSeparated(v.primary),
    "--primary-foreground": hexToHslSpaceSeparated(v.foreground),
    "--secondary": hexToHslSpaceSeparated(v.secondary),
    "--secondary-foreground": hexToHslSpaceSeparated(v.foreground),
    "--muted": hexToHslSpaceSeparated(v.surface),
    "--muted-foreground": hexToHslSpaceSeparated(v.mutedForeground),
    "--accent": hexToHslSpaceSeparated(v.secondary),
    "--accent-foreground": hexToHslSpaceSeparated(v.foreground),
    "--border": hexToHslSpaceSeparated(v.secondary),
    "--input": hexToHslSpaceSeparated(v.secondary),
    "--ring": hexToHslSpaceSeparated(v.primary),
    "--gold": hexToHslSpaceSeparated(v.primary),
    "--gold-glow": hexToHslSpaceSeparated(primaryGlow),
    "--icon": hexToHslSpaceSeparated(v.icons),
    "--cta": hexToHslSpaceSeparated(v.cta),
    "--cta-foreground": hexToHslSpaceSeparated(v.ctaText),
    "--header-brand": hexToHslSpaceSeparated(headerBrandHex),
    "--header-link": hexToHslSpaceSeparated(headerLinkHex),
    "--header-cta-bg": hexToHslSpaceSeparated(headerCtaBgHex),
    "--header-cta-text": hexToHslSpaceSeparated(headerCtaTextHex),
  } as CSSProperties;
}

/**
 * Maps centralized palette into `.vogue-nails-root` (HSL triplets).
 */
export function vogueNailsCssVarsFromConfig(config: SiteConfig): CSSProperties {
  const v = resolveVisualTheme(config);
  const headerBgHex = getSectionColorResolved(config, "header", "bg");
  const headerBrandHex = getSectionColorResolved(config, "header", "text");
  const headerLinkHex = getSectionColorResolved(config, "header", "link");
  const headerCtaBgHex = getSectionColorResolved(config, "header", "primaryBtnBg");
  const headerCtaTextHex = getSectionColorResolved(config, "header", "primaryBtnText");

  return {
    "--background": hexToHslSpaceSeparated(v.background),
    "--foreground": hexToHslSpaceSeparated(v.foreground),
    "--card": hexToHslSpaceSeparated(v.surface),
    "--card-foreground": hexToHslSpaceSeparated(v.foreground),
    "--primary": hexToHslSpaceSeparated(v.primary),
    "--primary-foreground": hexToHslSpaceSeparated(getTextColorHex(v.primary)),
    "--secondary": hexToHslSpaceSeparated(v.secondary),
    "--secondary-foreground": hexToHslSpaceSeparated(v.foreground),
    "--muted": hexToHslSpaceSeparated(v.surface),
    "--muted-foreground": hexToHslSpaceSeparated(v.mutedForeground),
    "--accent": hexToHslSpaceSeparated(v.secondary),
    "--accent-foreground": hexToHslSpaceSeparated(v.foreground),
    "--border": hexToHslSpaceSeparated(v.secondary),
    "--input": hexToHslSpaceSeparated(v.secondary),
    "--ring": hexToHslSpaceSeparated(v.primary),
    "--icon": hexToHslSpaceSeparated(v.icons),
    "--cta": hexToHslSpaceSeparated(v.cta),
    "--cta-foreground": hexToHslSpaceSeparated(v.ctaText),
    "--header-bg": hexToHslSpaceSeparated(headerBgHex),
    "--header-brand": hexToHslSpaceSeparated(headerBrandHex),
    "--header-link": hexToHslSpaceSeparated(headerLinkHex),
    "--header-cta-bg": hexToHslSpaceSeparated(headerCtaBgHex),
    "--header-cta-text": hexToHslSpaceSeparated(headerCtaTextHex),
  } as CSSProperties;
}
