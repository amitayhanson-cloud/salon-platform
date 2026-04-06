import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { defaultSiteConfig, defaultThemeColors } from "@/types/siteConfig";
import { hairLuxuryTemplate, type TemplateDefinition } from "@/lib/templateLibrary";
import { HAIR_HERO_IMAGES, HAIR_ABOUT_IMAGES } from "@/lib/hairImages";

const PREVIEW_SITE_ID = "builder-preview";

export function getHairLuxuryBuilderPreviewPayload(): {
  config: SiteConfig;
  template: TemplateDefinition;
  siteId: string;
  services: SiteService[];
} {
  const services: SiteService[] = [
    { id: "p1", name: "תספורת מעצב", duration: 45, price: "₪180", enabled: true, sortOrder: 0 },
    { id: "p2", name: "צבע ופן", duration: 120, price: "₪450", enabled: true, sortOrder: 1 },
  ];
  const config: SiteConfig = {
    ...defaultSiteConfig,
    salonName: "סטודיו תצוגה",
    salonType: "hair",
    address: "תל אביב",
    heroImage: HAIR_HERO_IMAGES[0],
    aboutImage: HAIR_ABOUT_IMAGES[0],
    themeColors: {
      ...defaultThemeColors,
      background: "#050816",
      surface: "#0f172a",
      text: "#f9fafb",
      mutedText: "#94a3b8",
      primary: "#e2b857",
      primaryText: "#0f172a",
      accent: "#e2b857",
      border: "#1e293b",
    },
    bookingOption: "booking_system",
    contactOptions: ["phone", "whatsapp"],
    mainGoals: ["online_booking"],
    extraPages: ["reviews", "faq"],
    publicSiteTemplateId: "hair-luxury",
  };
  return { config, template: hairLuxuryTemplate, siteId: PREVIEW_SITE_ID, services };
}
