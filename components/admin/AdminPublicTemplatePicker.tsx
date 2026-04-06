"use client";

import type { SiteConfig } from "@/types/siteConfig";
import type { PublicSiteTemplateId } from "@/types/siteConfig";
import { PublicSiteTemplatePickerForm } from "@/components/builder/PublicSiteTemplatePickerForm";
import { PUBLIC_TEMPLATE_SALON_TYPE } from "@/components/templates/builderPublicTemplates";

type AdminPublicTemplatePickerProps = {
  siteConfig: SiteConfig;
  onApplyTemplate: (patch: Pick<SiteConfig, "publicSiteTemplateId" | "salonType">) => void;
};

/**
 * Public marketing template switcher (same options as onboarding). Updates `publicSiteTemplateId`
 * and aligns `salonType` so previews and defaults stay coherent.
 */
export function AdminPublicTemplatePicker({
  siteConfig,
  onApplyTemplate,
}: AdminPublicTemplatePickerProps) {
  const selectedId: PublicSiteTemplateId =
    siteConfig.publicSiteTemplateId === "gentlemans-barber" ||
    siteConfig.publicSiteTemplateId === "vogue-nails" ||
    siteConfig.publicSiteTemplateId === "hair-luxury"
      ? siteConfig.publicSiteTemplateId
      : "hair-luxury";

  return (
    <PublicSiteTemplatePickerForm
      selectedId={selectedId}
      onSelect={(id) =>
        onApplyTemplate({
          publicSiteTemplateId: id,
          salonType: PUBLIC_TEMPLATE_SALON_TYPE[id],
        })
      }
    />
  );
}
