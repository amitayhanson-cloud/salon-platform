import type { CSSProperties } from "react";
import type { SiteConfig, SectionStyles, ThemePalette } from "@/types/siteConfig";
import { defaultThemeColors, defaultThemePalette } from "@/types/siteConfig";
import { getTextColorHex } from "@/lib/colorUtils";
import { hexToRgb } from "@/lib/hexColor";

export type ResolvedVisualTheme = ThemePalette & {
  foreground: string;
  mutedForeground: string;
  surface: string;
  ctaText: string;
};

function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const u = clamp01(t);
  const r = ca.r + (cb.r - ca.r) * u;
  const g = ca.g + (cb.g - ca.g) * u;
  const bch = ca.b + (cb.b - ca.b) * u;
  return (
    "#" +
    [r, g, bch]
      .map((x) =>
        Math.round(Math.max(0, Math.min(255, x)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function luminanceApprox(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Merge stored palette with legacy themeColors and defaults.
 */
export function resolveThemePalette(config: SiteConfig): ThemePalette {
  const tc = config.themeColors ?? defaultThemeColors;
  const p = config.themePalette;
  return {
    primary: p?.primary ?? tc.primary ?? defaultThemePalette.primary,
    secondary: p?.secondary ?? tc.border ?? defaultThemePalette.secondary,
    background: p?.background ?? tc.background ?? defaultThemePalette.background,
    headerFooter: p?.headerFooter ?? tc.surface ?? defaultThemePalette.headerFooter,
    cta: p?.cta ?? tc.primary ?? defaultThemePalette.cta,
    icons: p?.icons ?? tc.accent ?? defaultThemePalette.icons,
  };
}

export function resolveVisualTheme(config: SiteConfig): ResolvedVisualTheme {
  const palette = resolveThemePalette(config);
  const onPageLight = luminanceApprox(palette.background) > 0.55;
  const fgHex = getTextColorHex(palette.background);
  const foreground = fgHex === "#ffffff" ? "#f8fafc" : fgHex;
  const mutedForeground = onPageLight ? "#64748b" : "#94a3b8";
  const surface = mixHex(palette.background, "#ffffff", onPageLight ? 0.55 : 0.08);
  const ctaText = getTextColorHex(palette.cta);

  return {
    ...palette,
    foreground,
    mutedForeground,
    surface,
    ctaText,
  };
}

function headerLinkColor(headerFooter: string, icons: string): string {
  const onHeader = getTextColorHex(headerFooter);
  return onHeader === "#ffffff" ? "rgba(255,255,255,0.88)" : icons;
}

/** CSS variables on the site root (hex values). */
export function themePaletteRootStyle(config: SiteConfig): CSSProperties {
  const v = resolveVisualTheme(config);
  return {
    "--color-primary": v.primary,
    "--color-secondary": v.secondary,
    "--color-background": v.background,
    "--color-header-footer": v.headerFooter,
    "--color-cta": v.cta,
    "--color-icons": v.icons,
    "--color-foreground": v.foreground,
    "--color-muted-foreground": v.mutedForeground,
    "--color-surface": v.surface,
    "--color-cta-text": v.ctaText,
  } as CSSProperties;
}

const HERO_TEXT = "#f8fafc";
const HERO_SUBTITLE = "rgba(248,250,252,0.9)";

/**
 * Semantic section color when no sectionStyles override (central palette).
 */
export function resolveSectionSemanticColor(
  config: SiteConfig,
  section: keyof SectionStyles,
  key: string
): string {
  const v = resolveVisualTheme(config);

  if (section === "hero") {
    if (key === "text") return HERO_TEXT;
    if (key === "subtitleText") return HERO_SUBTITLE;
    if (key === "primaryBtnBg") return v.cta;
    if (key === "primaryBtnText") return v.ctaText;
    if (key === "secondaryBtnBg") return "rgba(255,255,255,0.12)";
    if (key === "secondaryBtnText") return HERO_TEXT;
    if (key === "overlayBg") return v.primary;
    if (key === "bg") return v.background;
  }

  if (section === "header") {
    if (key === "bg") return v.headerFooter;
    if (key === "text") return getTextColorHex(v.headerFooter);
    if (key === "link" || key === "linkActive") return headerLinkColor(v.headerFooter, v.icons);
    if (key === "linkHover") return v.primary;
    if (key === "border") return v.secondary;
    if (key === "primaryBtnBg") return v.cta;
    if (key === "primaryBtnText") return v.ctaText;
  }

  if (section === "footer") {
    if (key === "bg") return v.headerFooter;
    if (key === "text") return getTextColorHex(v.headerFooter) === "#ffffff" ? "rgba(255,255,255,0.75)" : v.mutedForeground;
    if (key === "link") return headerLinkColor(v.headerFooter, v.icons);
    if (key === "linkHover") return v.primary;
    if (key === "border") return v.secondary;
  }

  const sectionBg =
    section === "faq" || section === "reviews" ? v.surface : v.background;

  const map: Record<string, string> = {
    bg: sectionBg,
    titleText: v.primary,
    text: v.mutedForeground,
    subtitleText: v.mutedForeground,
    cardBg: v.surface,
    cardText: v.foreground,
    border: v.secondary,
    priceText: v.mutedForeground,
    chipBg: v.surface,
    chipText: v.foreground,
    itemBg: v.surface,
    itemText: v.foreground,
    itemBorder: v.secondary,
    starColor: v.icons,
    buttonBg: v.cta,
    buttonText: v.ctaText,
    overlayBg: v.primary,
    primaryBtnBg: v.cta,
    primaryBtnText: v.ctaText,
    secondaryBtnBg: v.surface,
    secondaryBtnText: v.foreground,
  };

  const hit = map[key];
  if (hit) return hit;

  return v.foreground;
}
