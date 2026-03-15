import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "תנאי שימוש | Caleno",
  description: "תנאי השימוש בשירות קלינו – זכויות, חובות והגבלות.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 text-right" dir="rtl">
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-caleno-deep hover:text-caleno-ink transition"
      >
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-2xl font-bold text-caleno-ink md:text-3xl">תנאי שימוש</h1>
      <p className="mt-2 text-sm text-gray-500">עדכון אחרון: פברואר 2025</p>

      <div className="mt-10 space-y-8 text-gray-600 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">1. קבלת התנאים</h2>
          <p className="mt-2 leading-relaxed">
            גישה לשימוש באתר ובשירותי קלינו (&quot;השירות&quot;) מהווה הסכמה לתנאים אלה ולמדיניות הפרטיות.
            אם אינך מסכים, אנא אל תשתמש בשירות.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">2. השירות</h2>
          <p className="mt-2 leading-relaxed">
            קלינו מספקת פלטפורמה לניהול עסקים קטנים: אתר, מערכת תורים, ניהול לקוחות, תזכורות ואוטומציות.
            השירות ניתן &quot;כמות שהוא&quot; (as is) בכפוף למגבלות הטכנולוגיה והתחזוקה.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">3. חשבון ואחריות</h2>
          <p className="mt-2 leading-relaxed">
            אתה אחראי לשמירה על סודיות פרטי החשבון ולכל הפעילות שמתבצעת תחתיו. אתה מתחייב לספק מידע
            נכון ולשמור על עדכונו. אתה אחראי לתוכן ולנתונים שאתה מזין במערכת (כולל נתוני לקוחות ותורים).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">4. גישה לתמיכה ולאבטחה</h2>
          <p className="mt-2 leading-relaxed">
            לצורכי תמיכה, תפעול, אבטחה ומניעת תקלות, לקלינו גישה לנתוני האתר, התורים והלקוחות שלך במערכת.
            אנו משתמשים בגישה זו אך ורק כדי לספק את השירות, לפתור תקלות ולתמוך בך, ובכפוף למדיניות
            הפרטיות ולחוק. אנו לא משתמשים בנתוני הלקוחות שלך למטרות שיווק או מעבירים אותם לצד שלישי
            למטרות אלה.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">5. שימוש הוגן</h2>
          <p className="mt-2 leading-relaxed">
            אסור להשתמש בשירות למטרות בלתי חוקיות, להפר זכויות של אחרים, להעלות תוכן מזיק או להפריע
            לתפעול השירות. שמירה על השירות למשתמשים אחרים היא באחריות כולם.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">6. קניין רוחני</h2>
          <p className="mt-2 leading-relaxed">
            השירות, הלוגו, העיצוב והטכנולוגיה של קלינו הם קניינה של קלינו. התוכן והנתונים שהעלית (כולל
            פרטי העסק והלקוחות) נשארים בבעלותך, בהתאם להסכמים ולתנאים שחלים על השימוש בפלטפורמה.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">7. הגבלת אחריות</h2>
          <p className="mt-2 leading-relaxed">
            השירות ניתן כפי שהוא. במידה המרבית המותרת בדין, קלינו לא תישא באחריות לנזקים עקיפים,
            מיוחדים או consequential הנובעים משימוש או אי-שימוש בשירות, כולל אובדן רווחים או נתונים.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">8. שינויים והפסקה</h2>
          <p className="mt-2 leading-relaxed">
            אנו רשאים לעדכן את התנאים מעת לעת; עדכון משמעותי יפורסם באתר. אנו רשאים להשעות או להפסיק
            את השירות או את חשבונך בהתאם לתנאים ולמדיניות הפנימית, עם הודעה סבירה במידת האפשר.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">9. יצירת קשר</h2>
          <p className="mt-2 leading-relaxed">
            לשאלות לגבי תנאי שימוש או מדיניות פרטיות, פנה אלינו דרך דף &quot;צור קשר&quot; באתר קלינו או בכתובת
            הדוא&quot;ל שמופיעה שם.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-gray-200 pt-8">
        <Link
          href="/"
          className="text-caleno-deep font-medium hover:text-caleno-ink transition"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
