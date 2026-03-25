import { cache } from "react";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { SiteConfig } from "@/types/siteConfig";
import { toAbsoluteAssetUrlFromOrigin } from "@/lib/metadataTenantIcons";

/**
 * Salon logo URL for loading UI / metadata (absolute). Deduped per request via React cache().
 */
export const getTenantLogoAbsoluteUrl = cache(
  async (siteId: string, origin: string): Promise<string | null> => {
    if (!siteId || siteId === "me") return null;
    try {
      const snap = await getAdminDb().collection("sites").doc(siteId).get();
      if (!snap.exists) return null;
      const cfg = (snap.data()?.config ?? {}) as Partial<SiteConfig>;
      const raw = cfg.branding?.logoUrl?.trim();
      if (!raw) return null;
      return toAbsoluteAssetUrlFromOrigin(origin, raw);
    } catch {
      return null;
    }
  }
);
