import type { Metadata } from "next";
import { headers } from "next/headers";
import SiteNavigationGate from "@/components/navigation/SiteNavigationGate";
import {
  calenoDefaultIcons,
  getRequestOriginFromHeaders,
  tenantIconsFromLogoAbsoluteUrl,
} from "@/lib/metadataTenantIcons";
import { getTenantLogoAbsoluteUrl } from "@/lib/tenantSiteLogoServer";

type Props = { children: React.ReactNode; params: Promise<{ siteId: string }> };

/**
 * Per-tenant favicon when the site is opened via /site/[siteId]/… on the platform host.
 * (Subdomain/custom-domain requests are handled in root `generateMetadata`.)
 */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { siteId } = await params;
  if (!siteId || siteId === "me") return {};

  const headersList = await headers();
  const origin = getRequestOriginFromHeaders(headersList);

  try {
    const absolute = await getTenantLogoAbsoluteUrl(siteId, origin);
    if (!absolute) {
      return { metadataBase: new URL(origin), icons: calenoDefaultIcons() };
    }
    return {
      metadataBase: new URL(origin),
      icons: tenantIconsFromLogoAbsoluteUrl(absolute),
    };
  } catch {
    return { metadataBase: new URL(origin), icons: calenoDefaultIcons() };
  }
}

export default async function SiteByIdLayout({ children, params }: Props) {
  const { siteId } = await params;
  if (!siteId || siteId === "me") {
    return children;
  }
  const headersList = await headers();
  const origin = getRequestOriginFromHeaders(headersList);
  const tenantLogoUrl = await getTenantLogoAbsoluteUrl(siteId, origin);

  return (
    <SiteNavigationGate siteId={siteId} tenantLogoUrl={tenantLogoUrl}>
      {children}
    </SiteNavigationGate>
  );
}
