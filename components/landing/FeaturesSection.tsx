"use client";

import Link from "next/link";
import {
  Globe,
  CalendarCheck,
  Users,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminPanelLink } from "@/components/AdminPanelLink";

const FEATURES = [
  {
    title: "אתר ומיתוג לעסק",
    icon: Globe,
    bullets: [
      "אתר מותאם אישית לכל עסק (לכל לקוח אתר משלו)",
      "לוגו, צבעים ותמונות — מותאם למותג",
      "ביקורות ו־FAQ באתר",
      "תת־דומיין אוטומטי + אפשרות לדומיין משלכם",
    ],
  },
  {
    title: "הזמנות אונליין חכמות",
    icon: CalendarCheck,
    bullets: [
      "לקוחות בוחרים שירות, תאריך, שעה ועובד",
      "הזמנות מרובות שירותים באותו ביקור",
      "קומבינציות/חבילות חכמות לפי חוקים (Combo)",
      "הזמנות חוזרות בסדרה",
    ],
  },
  {
    title: "יומן וניהול תורים",
    icon: ClipboardList,
    bullets: [
      "תצוגת יומן שבועיים + יום",
      "סינון לפי עובד",
      "ניהול זמינות, שעות פתיחה והפסקות לכל עובד",
      "ביטולים + סיבת ביטול + ארכיון מסודר",
    ],
  },
  {
    title: "לקוחות וצוות",
    icon: Users,
    bullets: [
      "כרטיס לקוח מלא: פרטים, היסטוריה והערות",
      "סוגי לקוחות (ברירת מחדל + מותאם אישית)",
      "ייבוא לקוחות מ־CSV/Excel בצורה פשוטה",
      "ניהול עובדים, שיבוץ לשירותים וזמינות",
    ],
  },
  {
    title: "וואטסאפ ואוטומציות",
    icon: MessageCircle,
    bullets: [
      "אישור תור בוואטסאפ",
      "תזכורת 24 שעות לפני",
      "אישור/ביטול בהודעה (כן/לא) ועדכון סטטוס אוטומטי",
      "תפריט ממוספר כשיש כמה תורים שממתינים לאישור",
    ],
  },
];

export default function FeaturesSection() {
  const { user, firebaseUser } = useAuth();
  const isLoggedInWithSite = !!user?.siteId;

  return (
    <section
      id="features"
      className="py-12 sm:py-16 md:py-24 border-t border-[#E2EEF2] bg-transparent"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#0F172A] text-center">
          מה תקבלו עם Caleno
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#475569] text-center max-w-3xl mx-auto">
          אתר עסקי, מערכת הזמנות אונליין וניהול מלא — הכל מחובר במקום אחד, בעברית ובקלות.
        </p>

        <div className="mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-2xl bg-white shadow-md border border-[#E2EEF2] p-4 sm:p-6 text-right"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#A7E6E7]/80 text-[#22A6A8] flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#0F172A]">
                    {feature.title}
                  </h3>
                </div>
                <ul className="mt-4 space-y-2 text-sm md:text-base text-[#475569]">
                  {feature.bullets.map((bullet, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[#2EC4C6] mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-[#475569] text-base md:text-lg mb-4">
            רוצים לראות איך זה נראה אצלכם בעסק? הקימו אתר והתחילו לקבל הזמנות אונליין.
          </p>
          {isLoggedInWithSite ? (
            <AdminPanelLink
              className="inline-block min-h-[44px] px-6 py-3 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center"
            >
              לפאנל ניהול
            </AdminPanelLink>
          ) : (
            <Link
              href="/signup"
              className="inline-block min-h-[44px] px-6 py-3 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center"
            >
              צור אתר עכשיו
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
