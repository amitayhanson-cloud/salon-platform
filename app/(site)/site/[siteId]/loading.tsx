import { LiquidGlassLoading } from "@/components/landing-v2/liquid-glass-loading";

/**
 * Fallback while a new segment under /site/[siteId]/… loads (e.g. / → /book).
 * Logo-specific feedback is handled by NavigationLoadingLayer on link clicks.
 */
export default function SiteIdSegmentLoading() {
  return <LiquidGlassLoading variant="inline" />;
}
