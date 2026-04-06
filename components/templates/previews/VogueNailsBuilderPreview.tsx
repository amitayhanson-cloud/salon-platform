"use client";

import { VogueNailsShell } from "@/components/templates/vogue-nails/VogueNailsShell";
import {
  BUILDER_VOGUE_PREVIEW_SERVICES,
  getVogueNailsBuilderPreviewConfig,
} from "@/lib/builderTemplatePreviewDefaults";

/**
 * Vogue nails preview — root `.vogue-nails-root` and scoped CSS ship inside {@link VogueNailsShell}.
 */
export default function VogueNailsBuilderPreview() {
  const config = getVogueNailsBuilderPreviewConfig();
  return (
    <div className="vogue-nails-builder-preview min-h-0 w-full min-w-0 bg-[hsl(55,80%,96%)]">
      <VogueNailsShell
        siteId="builder-preview"
        config={config}
        services={BUILDER_VOGUE_PREVIEW_SERVICES}
        hideHeader
      />
    </div>
  );
}
