import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { SiteConfig } from "@/types/siteConfig";
import {
  calenoDefaultIcons,
  getRequestOriginFromHeaders,
  tenantIconsFromLogoAbsoluteUrl,
  toAbsoluteAssetUrlFromOrigin,
} from "@/lib/metadataTenantIcons";

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
    const snap = await getAdminDb().collection("sites").doc(siteId).get();
    if (!snap.exists) {
      return { metadataBase: new URL(origin), icons: calenoDefaultIcons() };
    }
    const cfg = (snap.data()?.config ?? {}) as Partial<SiteConfig>;
    const raw = cfg.branding?.logoUrl?.trim();
    if (!raw) {
      return { metadataBase: new URL(origin), icons: calenoDefaultIcons() };
    }
    const absolute = toAbsoluteAssetUrlFromOrigin(origin, raw);
    return {
      metadataBase: new URL(origin),
      icons: tenantIconsFromLogoAbsoluteUrl(absolute),
    };
  } catch {
    return {};
  }
}

export default function SiteByIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
