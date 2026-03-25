"use client";

import { usePathname } from "next/navigation";
import { NavigationLoadingLayer } from "@/components/navigation/NavigationLoadingLayer";
import {
  isAdminAppPath,
  tenantSiteNavigationPredicate,
} from "@/components/navigation/navigationLoadingPredicates";

type Props = {
  siteId: string;
  tenantLogoUrl: string | null;
  children: React.ReactNode;
};

/**
 * Tenant site chrome: loading overlay for public salon navigations only.
 * Admin subtree uses its own Caleno overlay in admin/layout.
 */
export default function SiteNavigationGate({ siteId, tenantLogoUrl, children }: Props) {
  const pathname = usePathname() ?? "";

  if (!siteId || siteId === "me") {
    return <>{children}</>;
  }

  const destinationVariant = (nextUrl: URL) =>
    isAdminAppPath(nextUrl.pathname) ? "caleno" : "tenant";

  if (isAdminAppPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <NavigationLoadingLayer
      variant="tenant"
      tenantLogoUrl={tenantLogoUrl}
      shouldShowForNavigation={tenantSiteNavigationPredicate}
      variantForDestination={destinationVariant}
    >
      {children}
    </NavigationLoadingLayer>
  );
}
