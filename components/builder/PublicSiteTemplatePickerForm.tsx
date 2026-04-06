"use client";

import type { PublicSiteTemplateId } from "@/types/siteConfig";
import { PUBLIC_SITE_TEMPLATE_PICKER_INTRO_HE } from "@/components/templates/builderPublicTemplates";
import { BuilderTemplateSelector } from "@/components/builder/BuilderTemplateSelector";

export type PublicSiteTemplatePickerFormProps = {
  selectedId: PublicSiteTemplateId;
  onSelect: (id: PublicSiteTemplateId) => void;
};

/**
 * Hebrew intro + template cards + live preview modal. Used in admin (Site → template)
 * and in the onboarding builder so both pickers match.
 */
export function PublicSiteTemplatePickerForm({
  selectedId,
  onSelect,
}: PublicSiteTemplatePickerFormProps) {
  return (
    <div className="space-y-2 text-right sm:space-y-4">
      <p className="font-sans text-xs leading-snug text-[#417374] sm:text-sm sm:leading-relaxed">
        {PUBLIC_SITE_TEMPLATE_PICKER_INTRO_HE}
      </p>
      <BuilderTemplateSelector selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
