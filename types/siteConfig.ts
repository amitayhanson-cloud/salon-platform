export type MainGoal =
  | "new_clients"
  | "online_booking"
  | "show_photos"
  | "info_only";

export type ReviewItem = {
  id: string;
  name: string;
  rating: number; // 1-5
  text: string;
  avatarUrl?: string | null; // Optional profile image URL
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type ServiceItem = {
  id: string; // stable id
  name: string; // Hebrew name
  price: number; // ILS
};

// Service object stored in users/{uid}/site/main.services array
export type SiteService = {
  id: string; // stable id (generated)
  name: string; // Hebrew name
  description?: string;
  price?: number | string;
  category?: string;
  duration?: number;
  enabled?: boolean; // Default: true
  sortOrder?: number; // Default: 0
};

export type SiteConfig = {
  salonName: string;
  salonType: "hair" | "nails" | "barber" | "spa" | "mixed" | "other";
  city?: string; // Deprecated - kept for backward compatibility, use address instead
  neighborhood?: string; // Deprecated - kept for backward compatibility, use address instead
  address?: string; // Full business address for map display (required in builder)
  mainGoals: MainGoal[]; // array instead of single value
  services: string[]; // DEPRECATED - kept for backward compatibility, use siteServices instead
  siteServices?: SiteService[]; // Canonical services array - single source of truth
  vibe?: "clean" | "luxury" | "colorful" | "spa" | "surprise"; // Optional - kept for backwards compatibility, default is "clean"
  photosOption?: "own" | "ai" | "mixed"; // Optional - kept for backwards compatibility, default is "own"
  contactOptions: Array<
    "phone" | "whatsapp" | "instagram" | "facebook" | "contact_form"
  >;
  // Contact detail fields
  phoneNumber?: string;
  whatsappNumber?: string;
  instagramHandle?: string;
  facebookPage?: string;
  contactEmail?: string;
  bookingOption: "booking_system" | "simple_form" | "none";
  bookingSystemName?: string;
  extraPages: Array<"reviews" | "faq">;
  specialNote?: string;
  reviews?: ReviewItem[];
  faqs?: FaqItem[];
  servicePricing?: Record<string, number>; // service name -> starting price (ILS)
  heroImage?: string; // path to hero image (e.g., "/templates/hair/hero/hero1.jpg")
  aboutImage?: string; // path to about image (e.g., "/templates/hair/about/about1.jpg")
  themeColors?: {
    background: string; // page background
    surface: string; // card backgrounds
    text: string; // main text color
    mutedText: string; // secondary text
    primary: string; // buttons, highlights
    primaryText: string; // text on primary
    accent: string; // small accents (borders, chips)
    border: string; // border color
  };
  dividerStyle?: "none" | "wave" | "curve" | "angle";
  dividerHeight?: number;
};

export const defaultThemeColors = {
  background: "#f8fafc",
  surface: "#ffffff",
  text: "#0f172a",
  mutedText: "#475569",
  primary: "#0b1120",
  primaryText: "#ffffff",
  accent: "#1e3a8a",
  border: "#e2e8f0",
};

export const defaultSiteConfig: SiteConfig = {
  salonName: "",
  salonType: "hair",
  city: "", // Deprecated - kept for backward compatibility
  neighborhood: "", // Deprecated - kept for backward compatibility
  mainGoals: [], // array
  services: [], // string[]
  vibe: "clean",
  photosOption: "own",
  contactOptions: [],
  phoneNumber: "",
  whatsappNumber: "",
  instagramHandle: "",
  facebookPage: "",
  contactEmail: "",
  bookingOption: "none",
  bookingSystemName: "",
  extraPages: [],
  specialNote: "",
  reviews: [],
  faqs: [],
  servicePricing: {},
  themeColors: defaultThemeColors,
  dividerStyle: "wave",
  dividerHeight: 48,
};

