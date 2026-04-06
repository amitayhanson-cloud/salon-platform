"use client";

import { BarberTemplate } from "@/components/templates/gentlemans-barber/BarberTemplate";
import {
  BUILDER_BARBER_PREVIEW_SERVICES,
  getGentlemansBarberBuilderPreviewConfig,
} from "@/lib/builderTemplatePreviewDefaults";

/**
 * Barber template preview — root `.gents-barber-root` and scoped CSS ship inside {@link BarberTemplate}.
 */
export default function GentlemansBarberBuilderPreview() {
  const config = getGentlemansBarberBuilderPreviewConfig();
  return (
    <div className="gents-barber-builder-preview min-h-0 w-full min-w-0 bg-[#1a1a1a]">
      <BarberTemplate
        siteId="builder-preview"
        config={config}
        services={BUILDER_BARBER_PREVIEW_SERVICES}
        hideHeader
      />
    </div>
  );
}
