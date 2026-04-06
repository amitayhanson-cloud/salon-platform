"use client";

/**
 * Full-page Vogue Nails template preview (dev / design).
 * Open: /preview/nails
 */
import { VogueNailsShell } from "@/components/templates/vogue-nails/VogueNailsShell";
import { defaultSiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";

const DEMO_SERVICES: SiteService[] = [
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
  {
    id: "vn3",
    name: "עיצוב ציפורניים",
    description: "אמנות ציפורניים וצורות מותאמות אישית.",
    duration: 90,
    price: "₪120+",
    enabled: true,
    sortOrder: 2,
  },
];

export default function NailsPreviewPage() {
  return (
    <VogueNailsShell
      siteId="preview-nails"
      config={{
        ...defaultSiteConfig,
        salonName: "Velvet & Vogue · תצוגה",
        publicSiteTemplateId: "vogue-nails",
        salonType: "nails",
        address: "תל אביב",
        phoneNumber: "050-000-0000",
        bookingOption: "booking_system",
        contactOptions: ["phone", "whatsapp"],
        mainGoals: ["online_booking"],
      }}
      services={DEMO_SERVICES}
    />
  );
}
