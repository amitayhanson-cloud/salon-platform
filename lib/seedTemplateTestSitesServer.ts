/**
 * Seeds two fixed Firestore sites for visual template QA:
 *   sites/test-barber  (gentlemans-barber)
 *   sites/test-nails   (vogue-nails)
 *
 * Used by scripts/seedTemplateTestSites.ts and (optionally) the dev API route.
 * Admin SDK only — bypasses security rules.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";
import type { SiteConfig, SiteService, FaqItem, ReviewItem } from "@/types/siteConfig";
import { defaultThemeColors } from "@/types/siteConfig";
import { defaultBookingSettings, type BookingSettings } from "@/types/bookingSettings";
import { DEFAULT_HAIR_TEMPLATE_KEY } from "@/types/template";

const OWNER_SEED = "seed-template-test-sites";

/** Richer hours: Sun closed, Mon–Thu 9–20, Fri 8–14, Sat closed */
const SAMPLE_BOOKING_SETTINGS: BookingSettings = {
  slotMinutes: 30,
  days: {
    "0": { enabled: false, start: "09:00", end: "17:00" },
    "1": { enabled: true, start: "09:00", end: "20:00" },
    "2": { enabled: true, start: "09:00", end: "20:00" },
    "3": { enabled: true, start: "09:00", end: "20:00" },
    "4": { enabled: true, start: "09:00", end: "20:00" },
    "5": { enabled: true, start: "08:00", end: "14:00" },
    "6": { enabled: false, start: "09:00", end: "17:00" },
  },
  closedDates: [],
};

const BARBER_HERO =
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1920&q=80";
const NAILS_HERO =
  "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1920&q=80";
const NAILS_ABOUT =
  "https://images.unsplash.com/photo-1519014816548-bf6898331664?w=1200&q=80";

const NAILS_GALLERY = [
  "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80",
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
  "https://images.unsplash.com/photo-1610992015732-0ca40f57e4d6?w=800&q=80",
  "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=80",
  "https://images.unsplash.com/photo-1604902396830-74f2d8b0a5f1?w=800&q=80",
  "https://images.unsplash.com/photo-1519014816548-bf6898331664?w=800&q=80",
] as const;

const BARBER_GALLERY = [
  "https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?w=800&q=80",
  "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&q=80",
  "https://images.unsplash.com/photo-1621607512214-68297480165e?w=800&q=80",
  "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=800&q=80",
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&q=80",
  "https://images.unsplash.com/photo-1599351431202-1e0f03618d80?w=800&q=80",
] as const;

function barberServices(): SiteService[] {
  return [
    {
      id: "svc_test_barber_haircut",
      name: "תספורת חתימה",
      description:
        "ייעוץ, שטיפה, גזירה ועיצוב עם מוצרי פרימיום — חוויית תספורת מלאה.",
      duration: 60,
      price: "₪240",
      enabled: true,
      sortOrder: 0,
    },
    {
      id: "svc_test_barber_shave",
      name: "גילוח מסורתי",
      description: "גילוח בתער עם מגבות חמות, שמן לפני ואחרי.",
      duration: 45,
      price: "₪185",
      enabled: true,
      sortOrder: 1,
    },
    {
      id: "svc_test_barber_beard",
      name: "פיסול זקן",
      description: "עיצוב קווים, גזירה מדויקת וטיפוח זקן.",
      duration: 30,
      price: "₪150",
      enabled: true,
      sortOrder: 2,
    },
  ];
}

function nailsServices(): SiteService[] {
  return [
    {
      id: "svc_test_nails_gel",
      name: "לק ג׳ל",
      description: "טיפוח קוטיקולה, צורה ולק ג׳ל עמיד.",
      duration: 60,
      price: "₪180",
      enabled: true,
      sortOrder: 0,
    },
    {
      id: "svc_test_nails_pedi",
      name: "פדיקור ספא",
      description: "פדיקור מלא, שיוף, לחות ועיסוי קצר.",
      duration: 75,
      price: "₪220",
      enabled: true,
      sortOrder: 1,
    },
    {
      id: "svc_test_nails_art",
      name: "עיצוב ציפורניים",
      description: "אומנות ציפורניים, כרום, אומברה ועיטורים.",
      duration: 90,
      price: "₪120+",
      enabled: true,
      sortOrder: 2,
    },
  ];
}

function barberFaqs(): FaqItem[] {
  return [
    {
      id: "faq_barber_1",
      question: "האם צריך להזמין מראש?",
      answer:
        "מומלץ לקבוע תור מראש דרך האתר. לפי זמינות נשמח גם לפניות של הרגע האחרון.",
    },
    {
      id: "faq_barber_2",
      question: "מה מדיניות ביטול?",
      answer: "ניתן לבטל עד 12 שעות לפני מועד התור ללא חיוב.",
    },
  ];
}

function barberReviews(): ReviewItem[] {
  return [
    {
      id: "rev_barber_1",
      name: "יונתן",
      rating: 5,
      text: "תספורת מדויקת ואווירה מפנקת. חוזר כל חודש.",
    },
    {
      id: "rev_barber_2",
      name: "רועי",
      rating: 5,
      text: "הגילוח הכי טוב שקיבלתי בתל אביב.",
    },
  ];
}

function nailsFaqs(): FaqItem[] {
  return [
    {
      id: "faq_nails_1",
      question: "כמה זמן מחזיק לק ג׳ל?",
      answer:
        "בדרך כלל שבועיים ומעלה, תלוי בצמיחה ובטיפול ביתי. נשמח להמליץ במהלך הביקור.",
    },
    {
      id: "faq_nails_2",
      question: "אפשר לעשות עיצוב מורכב?",
      answer: "בהחלט — נא לציין בהזמנה כדי שנשריין זמן מתאים.",
    },
  ];
}

function nailsReviews(): ReviewItem[] {
  return [
    {
      id: "rev_nails_1",
      name: "מאיה",
      rating: 5,
      text: "הציפורניים החזיקו שלושה שבועות ונראו מושלם.",
    },
    {
      id: "rev_nails_2",
      name: "נועה",
      rating: 5,
      text: "פדיקור ספא מפנק, הסטודיו נקי ומסודר.",
    },
  ];
}

function barberConfig(): SiteConfig {
  const services = barberServices();
  return sanitizeForFirestore({
    salonName: "מועדון הג׳נטלמן · בדיקות",
    adminDisplayName: "בדיקות ברבר",
    publicSiteTemplateId: "gentlemans-barber",
    slug: "test-barber",
    salonType: "barber",
    address: "רחוב הרצל 10, תל אביב",
    mainGoals: ["online_booking", "new_clients"],
    services: services.map((s) => s.name),
    contactOptions: ["phone", "whatsapp", "instagram"],
    phoneNumber: "03-555-0140",
    whatsappNumber: "972501234567",
    instagramHandle: "test_barber_caleno",
    bookingOption: "booking_system",
    extraPages: ["reviews", "faq"],
    heroImage: BARBER_HERO,
    aboutImage: BARBER_HERO,
    galleryImages: [...BARBER_GALLERY],
    themeColors: {
      ...defaultThemeColors,
      background: "#1a1a1a",
      surface: "#262626",
      text: "#fafafa",
      mutedText: "#a3a3a3",
      primary: "#ca8a04",
      primaryText: "#0f172a",
      accent: "#ca8a04",
      border: "#404040",
    },
    reviews: barberReviews(),
    faqs: barberFaqs(),
    content: {
      hero: {
        tagline: "מאז 2019 · טיפוח פרימיום",
        title: "מספרה לבדיקות תבנית",
        subtitle: "אתר דמו לפיתוח — כל הנתונים ניתנים לעריכה בפאנל.",
      },
      about: {
        headingTitle: "החוויה",
        body: "זהו טקסט דמו לתצוגת התבנית. כאן תופיע ההיכרות עם העסק, ערכי השירות והאווירה. ניתן לעדכן את כל הפסקאות מממשק הניהול.",
      },
    },
  } as SiteConfig) as SiteConfig;
}

function nailsConfig(): SiteConfig {
  return sanitizeForFirestore({
    salonName: "Velvet & Vogue · בדיקות",
    adminDisplayName: "בדיקות ציפורניים",
    publicSiteTemplateId: "vogue-nails",
    slug: "test-nails",
    salonType: "nails",
    address: "דיזנגוף 99, תל אביב",
    mainGoals: ["online_booking", "show_photos"],
    services: nailsServices().map((s) => s.name),
    contactOptions: ["phone", "whatsapp", "instagram"],
    phoneNumber: "03-555-0141",
    whatsappNumber: "972509876543",
    instagramHandle: "test_nails_caleno",
    contactEmail: "hello-test@caleno.local",
    bookingOption: "booking_system",
    extraPages: ["reviews", "faq"],
    heroImage: NAILS_HERO,
    aboutImage: NAILS_ABOUT,
    galleryImages: [...NAILS_GALLERY],
    themeColors: {
      ...defaultThemeColors,
      background: "#fdf8f6",
      surface: "#ffffff",
      text: "#3f2e2e",
      mutedText: "#7c6565",
      primary: "#b76e79",
      primaryText: "#ffffff",
      accent: "#e8c4c8",
      border: "#edd5d8",
    },
    reviews: nailsReviews(),
    faqs: nailsFaqs(),
    content: {
      hero: {
        tagline: "סטודיו לציפורניים",
        title: "Velvet & Vogue · דמו",
        subtitle:
          "תבנית בדיקה עם תמונות, שירותים, שעות וטקסטים — מתעדכנת מפיירסטור לאחר הסיד.",
      },
      about: {
        headingTitle: "הסטודיו שלנו",
        body: "טקסט דמו לעמוד אודות: טיפוח ציפורניים, היגיינה וחומרים איכותיים. ערכו את התוכן בקלות מהאדמין.",
      },
    },
  } as SiteConfig) as SiteConfig;
}

export type SeedTemplateTestSitesResult = {
  ok: true;
  siteIds: readonly ["test-barber", "test-nails"];
  paths: string[];
};

/**
 * Writes / merges test-barber and test-nails site docs, booking settings, and one demo worker each.
 */
export async function runSeedTemplateTestSites(): Promise<SeedTemplateTestSitesResult> {
  const db = getAdminDb();
  const now = new Date();
  const batch = db.batch();

  const barberId = "test-barber" as const;
  const nailsId = "test-nails" as const;

  const barberRef = db.collection("sites").doc(barberId);
  const nailsRef = db.collection("sites").doc(nailsId);

  const barberSvc = barberServices();
  const nailsSvc = nailsServices();

  batch.set(
    barberRef,
    sanitizeForFirestore({
      ownerUid: OWNER_SEED,
      ownerUserId: OWNER_SEED,
      slug: "test-barber",
      config: barberConfig(),
      services: barberSvc,
      businessType: "barber",
      templateKey: DEFAULT_HAIR_TEMPLATE_KEY,
      templateSource: `seed/${barberId}`,
      createdAt: now,
      updatedAt: now,
      seededTemplateTest: true,
    }) as Record<string, unknown>,
    { merge: true }
  );

  batch.set(
    nailsRef,
    sanitizeForFirestore({
      ownerUid: OWNER_SEED,
      ownerUserId: OWNER_SEED,
      slug: "test-nails",
      config: nailsConfig(),
      services: nailsSvc,
      businessType: "nails",
      templateKey: DEFAULT_HAIR_TEMPLATE_KEY,
      templateSource: `seed/${nailsId}`,
      createdAt: now,
      updatedAt: now,
      seededTemplateTest: true,
    }) as Record<string, unknown>,
    { merge: true }
  );

  const bookingSanitized = sanitizeForFirestore(SAMPLE_BOOKING_SETTINGS) as Record<string, unknown>;

  batch.set(
    barberRef.collection("settings").doc("booking"),
    { ...bookingSanitized, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  batch.set(
    nailsRef.collection("settings").doc("booking"),
    { ...bookingSanitized, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const barberWorker = barberRef.collection("workers").doc("demo-worker-barber");
  batch.set(
    barberWorker,
    sanitizeForFirestore({
      name: "דני · ספר ראשי",
      role: "תספורות וגילוח",
      active: true,
      services: barberSvc.map((s) => s.name),
      createdAt: now,
      updatedAt: now,
    }) as Record<string, unknown>,
    { merge: true }
  );

  const nailsWorker = nailsRef.collection("workers").doc("demo-worker-nails");
  batch.set(
    nailsWorker,
    sanitizeForFirestore({
      name: "שירה · מניקוריסטית",
      role: "מניקור ופדיקור",
      active: true,
      services: nailsSvc.map((s) => s.name),
      createdAt: now,
      updatedAt: now,
    }) as Record<string, unknown>,
    { merge: true }
  );

  await batch.commit();

  return {
    ok: true,
    siteIds: ["test-barber", "test-nails"],
    paths: [
      `sites/${barberId}`,
      `sites/${nailsId}`,
      `sites/${barberId}/settings/booking`,
      `sites/${nailsId}/settings/booking`,
      `sites/${barberId}/workers/demo-worker-barber`,
      `sites/${nailsId}/workers/demo-worker-nails`,
    ],
  };
}
