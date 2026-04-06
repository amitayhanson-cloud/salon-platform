import { TenantInlineLoading } from "@/components/navigation/TenantInlineLoading";

/**
 * Fallback while a new segment under /site/[siteId]/… loads.
 * Neutral spinner only — avoids Caleno branding inside tenant admin / editor preview.
 */
export default function SiteIdSegmentLoading() {
  return <TenantInlineLoading />;
}
