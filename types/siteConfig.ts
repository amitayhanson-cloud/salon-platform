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

/**
 * Editable text content per section. Single source of truth for preview.
 * Preview reads only from config.content; inspector writes only to config.content.
 * For FAQ items use config.faqs[i].question/answer (paths faqs.0.question etc.).
 */
export type SiteContent = {
  header?: {
    brandName?: string;
    navAbout?: string;
    navServices?: string;
    navGallery?: string;
    navCtaBook?: string;
    navCtaContact?: string;
  };
  hero?: {
    tagline?: string;
    title?: string;
    subtitle?: string;
    ctaPrimaryText?: string;
    ctaSecondaryText?: string;
  };
  about?: {
    headingLabel?: string;
    headingTitle?: string;
    body?: string;
    chip1?: string;
    chip2?: string;
    chip3?: string;
  };
  services?: {
    sectionTitle?: string;
    sectionSubtitle?: string;
  };
  gallery?: {
    title?: string;
    subtitle?: string;
  };
  faq?: {
    sectionTitle?: string;
    sectionSubtitle?: string;
  };
  reviews?: {
    sectionLabel?: string;
    sectionTitle?: string;
  };
  map?: {
    title?: string;
    placeholderText?: string;
  };
  footer?: {
    copyright?: string;
  };
};

/** Per-section color overrides. All fields optional; missing → fallback to themeColors. */
export type SectionStyles = {
  header?: {
    bg?: string;
    text?: string;
    link?: string;
    linkActive?: string;
    linkHover?: string;
    border?: string;
    primaryBtnBg?: string;
    primaryBtnText?: string;
  };
  hero?: {
    bg?: string;
    text?: string;
    subtitleText?: string;
    overlayBg?: string;
    primaryBtnBg?: string;
    primaryBtnText?: string;
    secondaryBtnBg?: string;
    secondaryBtnText?: string;
  };
  about?: {
    bg?: string;
    titleText?: string;
    text?: string;
    cardBg?: string;
    cardText?: string;
    border?: string;
  };
  services?: {
    bg?: string;
    titleText?: string;
    text?: string;
    cardBg?: string;
    cardText?: string;
    priceText?: string;
    border?: string;
    chipBg?: string;
    chipText?: string;
  };
  gallery?: {
    bg?: string;
    titleText?: string;
    text?: string;
    cardBg?: string;
    border?: string;
  };
  faq?: {
    bg?: string;
    titleText?: string;
    text?: string;
    itemBg?: string;
    itemText?: string;
    itemBorder?: string;
  };
  reviews?: {
    bg?: string;
    titleText?: string;
    text?: string;
    cardBg?: string;
    cardText?: string;
    starColor?: string;
    border?: string;
  };
  map?: {
    bg?: string;
    titleText?: string;
    text?: string;
    cardBg?: string;
    cardText?: string;
    border?: string;
    buttonBg?: string;
    buttonText?: string;
  };
  footer?: {
    bg?: string;
    text?: string;
    link?: string;
    linkHover?: string;
    border?: string;
  };
  booking?: { bg?: string; titleText?: string; cardBg?: string; cardText?: string };
};

// Service object stored in users/{uid}/site/main.services array
export type SiteService = {
  id: string; // stable id (generated)
  name: string; // Hebrew name
  description?: string;
  price?: number | string;
  category?: string;
  duration?: number; // minutes
  enabled?: boolean; // Default: true
  sortOrder?: number; // Default: 0
  color?: string; // Hex color for service (e.g., "#3B82F6")
  /** Optional image URL for public site services grid */
  imageUrl?: string | null;
  /** When true, a single finishing service (e.g. פן) is appended once at the end of multi-service chains. */
  requiresFinish?: boolean;
  /** Gap in minutes after this service ends before the finishing service starts. Used when this is the last selected service and needsFinish is true. Default 0. */
  finishGapMinutes?: number;
};

export type SiteConfig = {
  /** Tenant subdomain slug (e.g. "alice" → alice.caleno.co). Set when tenant is created. */
  slug?: string | null;
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
  /** Optional gallery image URLs; fallback to template default images when missing */
  galleryImages?: string[];
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
  /** Per-section color overrides. Missing keys fall back to themeColors. */
  sectionStyles?: SectionStyles;
  /** Editable text content per section. Single source of truth for preview. */
  content?: SiteContent;
  dividerStyle?: "none" | "wave" | "curve" | "angle";
  dividerHeight?: number;
  /** Automatic deletion of archived (cancelled + expired) bookings. Stored at sites/{siteId}.config.archiveRetention */
  archiveRetention?: ArchiveRetention;
  /** Per-site branding (logo for header) */
  branding?: SiteBranding;
}

/** Per-site branding (logo shown in public header) */
export type SiteBranding = {
  logoUrl?: string | null;
  logoAlt?: string;
  /** Cloudinary public_id for future delete/overwrite (e.g. sites/{siteId}/branding/logo) */
  logoPublicId?: string | null;
};

/** Per-site setting for automatic deletion of archived bookings (cancelled + expired) */
export type ArchiveRetention = {
  autoDeleteEnabled: boolean;
  frequency: "weekly";
  weekday: number; // 0=Sunday, 1=Monday, ... 6=Saturday
  hour: number; // 0-23
  minute: number; // 0-59
  timezone: string; // e.g. "Asia/Jerusalem"
  deleteScope: "all" | "olderThanDays";
  olderThanDays?: number; // e.g. keep last 30 days, delete older
  lastRunAt?: string; // ISO string, set by Cloud Function to avoid double-runs
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
  bookingOption: "simple_form",
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

