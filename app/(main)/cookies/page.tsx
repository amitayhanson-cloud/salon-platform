import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "מדיניות עוגיות | Caleno",
  description: "מדיניות העוגיות של קלינו – אילו עוגיות אנו משתמשים ולמה.",
};

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-right sm:px-6 lg:px-8" dir="rtl">
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-caleno-deep transition hover:text-caleno-ink"
      >
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-2xl font-bold text-caleno-ink md:text-3xl">מדיניות עוגיות</h1>
      <p className="mt-2 text-sm text-gray-500">עדכון אחרון: מרץ 2026</p>

      <div className="mt-10 space-y-8 leading-relaxed text-gray-600">
        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">1. מה הן עוגיות?</h2>
          <p className="mt-2">
            עוגיות (Cookies) הן קבצי טקסט קטנים שנשמרים בדפדפן שלך. הן עוזרות לנו להפעיל את האתר, לזכור
            העדפות ולשפר את חוויית השימוש.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">2. אילו עוגיות אנו משתמשים?</h2>
          <p className="mt-2">
            בקלינו אנו משתמשים בעיקר בעוגיות הכרחיות לתפעול המערכת (למשל שמירת התחברות, אבטחה והעדפות בסיסיות),
            ובחלק מהמקרים בעוגיות לשיפור חוויית המשתמש וביצועי האתר.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">3. למה משתמשים בעוגיות?</h2>
          <ul className="mt-2 list-disc space-y-1 pr-5">
            <li>להפעלת פונקציות חיוניות באתר</li>
            <li>לשמירת העדפות משתמש</li>
            <li>לשיפור ביצועים ויציבות</li>
            <li>להגנה ואבטחת חשבונות</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">4. ניהול העדפות עוגיות</h2>
          <p className="mt-2">
            ניתן לבחור בבאנר העוגיות אם לאשר את כל העוגיות או רק עוגיות הכרחיות. בנוסף, אפשר לשנות או למחוק
            עוגיות דרך הגדרות הדפדפן בכל עת.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">5. עדכונים למדיניות</h2>
          <p className="mt-2">
            אנו עשויים לעדכן מדיניות זו מעת לעת. כל שינוי מהותי יפורסם בעמוד זה עם תאריך עדכון מעודכן.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-gray-200 pt-8">
        <Link href="/" className="font-medium text-caleno-deep transition hover:text-caleno-ink">
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
