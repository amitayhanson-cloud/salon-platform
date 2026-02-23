"use client";

import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { getTemplateByKey } from "@/lib/templateLibrary";
import HairLuxurySite from "@/app/(site)/site/[siteId]/HairLuxurySite";

export type WebsiteRendererMode = "public" | "preview" | "editor";

export interface WebsiteRendererProps {
  templateKey: string;
  siteConfig: SiteConfig;
  mode: WebsiteRendererMode;
  siteId: string;
  services: SiteService[];
}

/**
 * Renders the public website for a given template and config.
 * Today: only hair1 (HairLuxurySite). Future: add cases for hair2, barber1, nails1, etc.
 */
export default function WebsiteRenderer({
  templateKey,
  siteConfig,
  mode,
  siteId,
  services,
}: WebsiteRendererProps) {
  const template = getTemplateByKey(templateKey);

  const editorMode = mode === "editor";

  switch (templateKey) {
    case "hair1":
      return (
        <HairLuxurySite
          config={siteConfig}
          template={template}
          siteId={siteId}
          services={services}
          editorMode={editorMode}
        />
      );
    // Future: case "hair2": return <Hair2Site ... />;
    // Future: case "barber1": return <Barber1Site ... />;
    default:
      return (
        <HairLuxurySite
          config={siteConfig}
          template={template}
          siteId={siteId}
          services={services}
          editorMode={editorMode}
        />
      );
  }
}
