/**
 * Caleno SaaS landing page copy and data.
 * Single source of truth for sections; theme remains neutral (gray).
 */

export const NAV_LINKS = [
  { href: "#how-it-works", label: "איך זה עובד" },
  { href: "#features", label: "פיצ'רים" },
  { href: "#pricing", label: "תמחור" },
  { href: "#contact", label: "צור קשר" },
] as const;

export const HEADER_CTA = "צור אתר עכשיו" as const;

export const HERO = {
  headline: "ניהול תורים, לקוחות ותשלומים במקום אחד",
  subheadline:
    "קלינו נותנת לעסקים קטנים וסלונים אתר מקצועי, מערכת זימון תורים, ניהול לקוחות ואוטומציות וואטסאפ — בלי המורכבות.",
  primaryCta: "צור אתר עכשיו",
  secondaryCta: "איך זה עובד",
} as const;

export const TRUST = {
  line: "עסקים בתחום השירות כבר עובדים עם קלינו",
  logos: ["Partner 1", "Partner 2", "Partner 3", "Partner 4", "Partner 5"],
} as const;

export const PRODUCT_EXPLANATION = {
  title: "פלטפורמה אחת לכל העסק שלך",
  bullets: [
    "יומן ותיאום תורים אונליין שהלקוחות באמת משתמשים בו",
    "כרטיס לקוח חכם: היסטוריה, הערות והעדפות במקום אחד",
    "תשלומים, חבילות ומנויים — הכל מנוהל בצורה מסודרת",
    "אישורי תור ותזכורות ב-WhatsApp על אוטומט",
    "פאנל ניהול נוח שעובד מושלם גם במחשב וגם בנייד",
  ],
  imagePlaceholder: "צילום מסך / הדמיית מוצר",
} as const;

export const FEATURES_SECTION = {
  headline: "כל מה שצריך כדי לנהל עסק — במקום אחד",
  subtitle:
    "תיאום תורים, לקוחות, תשלומים ואוטומציות WhatsApp — בצורה מסודרת ופשוטה.",
} as const;

export const FEATURES_LIST = [
  {
    id: "scheduling",
    title: "תיאום תורים והזמנות",
    description:
      "יומן חכם, תורים חוזרים וזמינות בזמן אמת — כדי שהלקוחות יקבעו לבד.",
    icon: "calendar",
  },
  {
    id: "clients",
    title: "ניהול לקוחות",
    description:
      "כרטיסי לקוח עם היסטוריה, הערות והעדפות — כדי לתת שירות אישי ולחזור אליהם מהר.",
    icon: "users",
  },
  {
    id: "payments",
    title: "תשלומים וחבילות",
    description:
      "גביית תשלום, חבילות ומנויים ישירות מהמערכת — עם סדר ושליטה מלאה.",
    icon: "credit-card",
  },
  {
    id: "whatsapp",
    title: "אוטומציות WhatsApp",
    description:
      "אישורי תור, תזכורות ועדכונים נשלחים אוטומטית — פחות ביטולים, יותר הגעה.",
    icon: "message-circle",
  },
  {
    id: "admin",
    title: "פאנל ניהול מתקדם",
    description:
      "שליטה בשירותים, צוות, זמינות ולקוחות — מהמחשב או מהנייד, בכל רגע.",
    icon: "settings",
  },
  {
    id: "website",
    title: "אתר מקצועי לעסק",
    description:
      "אתר ממותג שמציג את העסק ומאפשר קביעת תורים אונליין — בלי התעסקות טכנית.",
    icon: "globe",
  },
] as const;

export const DEMO_SECTION = {
  headline: "תראו את קלינו בפעולה",
  subtitle:
    "יומן תורים, ניהול לקוחות ואוטומציות WhatsApp — הכל מפאנל ניהול אחד.",
  placeholderSuffix: "— תצוגת המערכת",
} as const;

export const DEMO_TABS = [
  { id: "calendar", label: "יומן תורים" },
  { id: "clients", label: "לקוחות" },
  { id: "whatsapp", label: "אוטומציות WhatsApp" },
] as const;

export const HOW_IT_WORKS_SECTION = {
  title: "איך זה עובד",
  subtitle: "מתחילים ב־3 צעדים פשוטים.",
} as const;

export const HOW_IT_WORKS_STEPS = [
  {
    step: 1,
    title: "נרשמים ומגדירים את העסק",
    description:
      "מוסיפים שירותים, צוות ושעות זמינות — תוך דקות. אנחנו דואגים שהכול ייראה מקצועי ומוכן ללקוחות.",
  },
  {
    step: 2,
    title: "משתפים את קישור ההזמנה",
    description:
      "הלקוחות קובעים תור אונליין, ואתם מקבלים יומן מעודכן בזמן אמת + תזכורות אוטומטיות שמקטינות ביטולים.",
  },
  {
    step: 3,
    title: "מנהלים ומגדילים הכנסות",
    description:
      "מהפאנל האדמין מנהלים תורים, לקוחות ותשלומים — ואוטומציות WhatsApp עוזרות לכם להישאר בשליטה ולמלא את היומן.",
  },
] as const;

export const PRICING_SECTION = {
  title: "תמחור פשוט ושקוף",
  subtitle:
    "בחרו את התוכנית שמתאימה לעסק שלכם. ניתן לשדרג או לשנות בכל רגע.",
  badge: "הפופולרי ביותר",
  cta: "התחילו עכשיו",
} as const;

export const PRICING_TIERS = [
  {
    id: "starter",
    name: "Starter",
    price: "29",
    period: " / חודש",
    description: "לעסקים קטנים או נותני שירות עצמאיים.",
    features: [
      "עד 2 אנשי צוות",
      "יומן תורים ללא הגבלה",
      "מאגר לקוחות מלא",
      "תמיכה באימייל",
    ],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "79",
    period: " / חודש",
    description: "לעסקים בצמיחה וסלונים עם מספר אנשי צוות.",
    features: [
      "אנשי צוות ללא הגבלה",
      "אישורי ותזכורות WhatsApp אוטומטיות",
      "ניהול תשלומים וחבילות",
      "תמיכה מועדפת",
    ],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    price: "149",
    period: " / חודש",
    description: "לעסקים גדולים יותר עם צרכים מתקדמים.",
    features: [
      "כל מה שיש בתוכנית Pro",
      "דומיין ומיתוג מותאם אישית",
      "דוחות וניתוחים מתקדמים",
      "תמיכה ייעודית",
    ],
    highlighted: false,
  },
] as const;

export const CONTACT_SECTION = {
  title: "דברו איתנו",
  subtitle:
    "יש לכם שאלה? נשמח לעזור. פנו אלינו לתמיכה, ייעוץ או שיתוף פעולה.",
  buttonLabel: "צרו קשר",
} as const;

export const FINAL_CTA = {
  headline: "מוכנים לפשט את ניהול העסק?",
  subline:
    "הצטרפו לעסקים שכבר משתמשים בקלינו כדי לחסוך זמן, להוריד עומס — ולהחזיר לקוחות שוב ושוב.",
  buttonLabel: "התחילו עכשיו",
} as const;

export const FOOTER = {
  product: {
    title: "מוצר",
    links: [
      { label: "פיצ'רים", href: "#features" },
      { label: "תמחור", href: "#pricing" },
      { label: "איך זה עובד", href: "#how-it-works" },
      { label: "אינטגרציות", href: "#" },
    ],
  },
  company: {
    title: "חברה",
    links: [
      { label: "אודות", href: "#" },
      { label: "בלוג", href: "#" },
      { label: "צרו קשר", href: "#contact" },
      { label: "קריירה", href: "#" },
    ],
  },
  legal: {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Cookies", href: "#" },
    ],
  },
  social: {
    title: "Social",
    links: [
      { label: "Twitter", href: "#" },
      { label: "LinkedIn", href: "#" },
      { label: "Instagram", href: "#" },
    ],
  },
  copyright: "© קלינו. כל הזכויות שמורות.",
} as const;
