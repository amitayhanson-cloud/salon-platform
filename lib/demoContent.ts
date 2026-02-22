/**
 * Demo content for new sites (FAQs, reviews) when extra pages are selected.
 */

import type { FaqItem, ReviewItem } from "@/types/siteConfig";

export function generateDemoFaqs(): FaqItem[] {
  return [
    {
      id: `faq_${Date.now()}_1`,
      question: "מה מדיניות הביטולים?",
      answer:
        "ניתן לבטל תור עד 24 שעות מראש ללא תשלום. ביטול ברגע האחרון או אי הגעה יחייבו תשלום של 50% מעלות השירות.",
    },
    {
      id: `faq_${Date.now()}_2`,
      question: "כמה זמן לוקח טיפול?",
      answer:
        "משך הטיפול תלוי בסוג השירות. תספורת נשים אורכת כ-45-60 דקות, צבע שיער כ-2-3 שעות, וטיפולי פן או החלקה כ-2-4 שעות. נשמח לספק הערכה מדויקת בעת קביעת התור.",
    },
  ];
}

export function generateDemoReviews(): ReviewItem[] {
  return [
    {
      id: `review_${Date.now()}_1`,
      name: "שרה כהן",
      rating: 5,
      text: "חוויה מדהימה! הצוות מקצועי מאוד, האווירה נעימה והתוצאה מעבר למצופה. בהחלט אחזור שוב.",
    },
    {
      id: `review_${Date.now()}_2`,
      name: "מיכל לוי",
      rating: 5,
      text: "הסלון נקי ומסודר, המעצבת הקשיבה לכל הבקשות שלי והתוצאה מושלמת. ממליצה בחום!",
    },
    {
      id: `review_${Date.now()}_3`,
      name: "דני רוזן",
      rating: 4,
      text: "שירות מעולה ומקצועי. התור התחיל בזמן, הטיפול היה איכותי והמחיר הוגן. אמליץ לחברים.",
    },
  ];
}
