"use client";

import HairLuxurySite from "@/app/(site)/site/[siteId]/HairLuxurySite";
import { SiteThemeVariablesRoot } from "@/components/builder/SiteThemeVariablesRoot";
import { getHairLuxuryBuilderPreviewPayload } from "@/lib/builderTemplatePreviewDefaults";

/** Luxury hair public site preview for the builder modal (theme vars + reliable image URLs). */
export default function HairLuxuryBuilderPreview() {
  const { config, template, siteId, services } = getHairLuxuryBuilderPreviewPayload();
  return (
    <div className="hair-luxury-builder-preview min-h-0 w-full min-w-0 bg-[#050816]">
      <SiteThemeVariablesRoot config={config} className="min-h-0">
        <HairLuxurySite
          config={config}
          template={template}
          siteId={siteId}
          services={services}
          visibleProducts={[]}
          hideHeader
        />
      </SiteThemeVariablesRoot>
    </div>
  );
}
