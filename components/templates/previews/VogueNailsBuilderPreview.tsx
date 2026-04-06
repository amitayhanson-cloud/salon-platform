"use client";

import { VogueNailsShell } from "@/components/templates/vogue-nails/VogueNailsShell";
import { defaultSiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";

const PREVIEW_SERVICES: SiteService[] = [
  {
    id: "vn1",
    name: "לק ג׳ל",
    description: "טיפוח ידיים, גזירת קוטיקולה ולק ג׳ל עמיד.",
    duration: 60,
    price: "₪180",
    enabled: true,
    sortOrder: 0,
  },
  {
    id: "vn2",
    name: "פדיקור ספא",
    description: "פדיקור מלא עם שיוף, לחות ועיסוי קצר.",
    duration: 75,
    price: "₪220",
    enabled: true,
    sortOrder: 1,
  },
];

export default function VogueNailsBuilderPreview() {
  return (
    <div className="max-h-[min(85vh,860px)] overflow-y-auto overflow-x-hidden rounded-xl border border-rose-100 bg-white shadow-inner">
      <VogueNailsShell
        siteId="builder-preview"
        config={{
          ...defaultSiteConfig,
          salonName: "סלון תצוגה",
          publicSiteTemplateId: "vogue-nails",
          address: "תל אביב",
          bookingOption: "booking_system",
        }}
        services={PREVIEW_SERVICES}
      />
    </div>
  );
}
