/**
 * Caleno SaaS landing page copy and data.
 * Single source of truth for sections; theme remains neutral (gray).
 */

export const NAV_LINKS = [
  { href: "#how-it-works", label: "איך זה עובד" },
  { href: "#features", label: "פיצ'רים" },
  { href: "/pricing", label: "תמחור" },
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
    "יומן תורים, ניהול לקוחות ואתר עסקי — הכל מפאנל ניהול אחד.",
  placeholderSuffix: "— תצוגת המערכת",
  /** Caption under tabs when the website tab is active. */
  websiteTabCaption: "תצוגה לדוגמה של אתר העסק שנבנה אוטומטית עם קלינו",
} as const;

export const DEMO_TABS = [
  { id: "clients", label: "לקוחות" },
  { id: "whatsapp", label: "האתר שלכם" },
  { id: "calendar", label: "יומן תורים" },
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
    "שתי רמות ברורות: מה שנדרש כדי להפעיל את העסק בקלינו, ותוספות שמעצימות את החוויה — בלי חובה.",
  badge: "תוספות מומלצות",
  cta: "התחילו עכשיו",
} as const;

/** שני חבילות בלבד: בסיס = חובה לשימוש; פלוס = דברים מדהימים שלא חייבים */
export const PRICING_TIERS = [
  {
    id: "essential",
    name: "Caleno בסיסי",
    price: "מ־49 ₪",
    period: " לחודש",
    description:
      "כל מה שצריך כדי להריץ את העסק במערכת: אתר, תורים, לקוחות וניהול שוטף.",
    features: [
      "אתר עסקי ודף הזמנות ללקוחות",
      "יומן תורים וניהול זמינות",
      "מאגר לקוחות וכרטיסי לקוח",
      "פאנל ניהול מלא — גם במחשב וגם בנייד",
      "תמיכה במייל",
    ],
    highlighted: false,
  },
  {
    id: "plus",
    name: "Caleno+",
    price: "מ־99 ₪",
    period: " לחודש",
    description:
      "תוספות שלא חובה — אבל יכולות לחסוך זמן, להעלות הכנסות ולתת מראה מקצועי יותר.",
    features: [
      "אוטומציות WhatsApp — אישורי תור ותזכורות אוטומטיות",
      "תשלומים, חבילות ומנויים מהמערכת",
      "דוחות ותובנות מתקדמות יותר",
      "דומיין ומיתוג מותאמים + תמיכה מועדפת",
    ],
    highlighted: true,
  },
] as const;

/** עמוד /pricing — כותרות וטקסטים משפטיים (אינם ייעוץ משפטי) */
export const PRICING_PAGE = {
  title: "תמחור ומנויים",
  intro:
    "להלן מבנה החבילות של קלינו. בחירת מנוי והתשלום כפופים להצגת התנאים המלאים בעת הרכישה, לתנאי השימוש ולמדיניות הפרטיות.",
} as const;

export const PRICING_RETURN_POLICY = {
  title: "מדיניות ביטולים והחזרים",
  paragraphs: [
    "ביטול מנוי: ניתן לבקש ביטול מנוי בהתאם להוראות שיוצגו לך בממשק החיוב ובאישור הרכישה. בדרך כלל השירות יישאר זמין עד סוף תקופת החיוב ששולמה, אלא אם נקבע אחרת בעת העסקה.",
    "החזרים: בקשות להחזר כספי יטופלו לפי התנאים שיפורטו בעמוד התשלום ובאישור העסקה שקיבלת (לרבות מועדי החזר ואחוזים). במקרה של מחלוקת ניתן לפנות לשירות הלקוחות עם פרטי העסקה.",
    "שינוי מחירים: קלינו רשאית לעדכן מחירים או מבנה חבילות בהודעה מראש סבירה, בהתאם לתנאי השימוש. המחיר המחייב לתקופת חיוב נקבע בעת אישור התשלום.",
  ],
} as const;

export const PRICING_DISCLAIMER = {
  title: "הצהרה והבהרה משפטית",
  paragraphs: [
    "עמוד זה מספק סקירה כללית בלבד ואינו מהווה הצעה מחייבת או חוזה. התחייבותך נוצרת רק לאחר השלמת תהליך הרכישה/התשלום וקבלת אישור כפי שיופיעו במערכת.",
    "תיאורי התכונות בחבילות עשויים להשתנות עם פיתוח המוצר. הגרסה המעודכנת תופיע בממשק הניהול ובחומרים שיסופקו לך בעת ההרשמה או השדרוג.",
    "אין בעמוד זה ייעוץ משפטי, מס או פיננסי. מומלץ לקרוא את תנאי השימוש ואת מדיניות הפרטיות, ולפנות לייעוץ מקצועי כשצריך.",
  ],
} as const;

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
      { label: "תמחור", href: "/pricing" },
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
    title: "משפטי",
    links: [
      { label: "מדיניות פרטיות", href: "/privacy" },
      { label: "תנאי שימוש", href: "/terms" },
      { label: "עוגיות", href: "/cookies" },
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
