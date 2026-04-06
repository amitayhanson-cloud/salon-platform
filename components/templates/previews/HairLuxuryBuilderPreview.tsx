"use client";

import HairLuxurySite from "@/app/(site)/site/[siteId]/HairLuxurySite";
import { getHairLuxuryBuilderPreviewPayload } from "@/lib/builderTemplatePreviewDefaults";
import { themePaletteRootStyle } from "@/lib/themePalette";

/** Scrolled preview of the luxury hair public site for the builder modal. */
export default function HairLuxuryBuilderPreview() {
  const { config, template, siteId, services } = getHairLuxuryBuilderPreviewPayload();
  return (
    <div className="max-h-[min(85vh,860px)] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200/80 bg-[#050816] shadow-inner">
      <div style={themePaletteRootStyle(config)}>
        <HairLuxurySite
          config={config}
          template={template}
          siteId={siteId}
          services={services}
          visibleProducts={[]}
        />
      </div>
    </div>
  );
}
