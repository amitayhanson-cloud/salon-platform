"use client";

import { BarberTemplate } from "@/components/templates/gentlemans-barber/BarberTemplate";
import { defaultSiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";

const PREVIEW_SERVICES: SiteService[] = [
  { id: "b1", name: "תספורת חתימה", duration: 60, price: "₪240", enabled: true, sortOrder: 0 },
  { id: "b2", name: "גילוח מסורתי", duration: 45, price: "₪185", enabled: true, sortOrder: 1 },
];

export default function GentlemansBarberBuilderPreview() {
  return (
    <div className="max-h-[min(85vh,860px)] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200/80 bg-[#1a1a1a] shadow-inner">
      <BarberTemplate
        siteId="builder-preview"
        config={{
          ...defaultSiteConfig,
          salonName: "מועדון הג׳נטלמן · תצוגה",
          salonType: "barber",
          publicSiteTemplateId: "gentlemans-barber",
        }}
        services={PREVIEW_SERVICES}
      />
    </div>
  );
}
