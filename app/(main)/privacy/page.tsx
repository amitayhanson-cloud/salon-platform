import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | Caleno",
  description: "מדיניות הפרטיות של קלינו – איסוף, שימוש והגנה על המידע שלך.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 text-right" dir="rtl">
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-caleno-deep hover:text-caleno-ink transition"
      >
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-2xl font-bold text-caleno-ink md:text-3xl">מדיניות פרטיות</h1>
      <p className="mt-2 text-sm text-gray-500">עדכון אחרון: פברואר 2025</p>

      <div className="mt-10 space-y-8 text-gray-600 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">1. כללי</h2>
          <p className="mt-2 leading-relaxed">
            קלינו (&quot;אנחנו&quot;, &quot;השירות&quot;) מכבדת את פרטיותך. מדיניות זו מתארת אילו מידעים אנו אוספים,
            כיצד אנו משתמשים בהם ובאילו נסיבות אנו עשויים לחשוף אותם.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">2. מידע שאנו אוספים</h2>
          <p className="mt-2 leading-relaxed">
            אנו אוספים מידע שאתה מספק בעת הרשמה ושימוש בשירות, לרבות: שם, כתובת דוא&quot;ל, מספר טלפון,
            פרטי העסק והאתר, נתוני תורים ולקוחות שאתה מזין במערכת. אנו גם אוספים נתוני שימוש (לוגים, כתובת IP)
            לצורכי תפעול ואבטחה.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">3. שימוש במידע</h2>
          <p className="mt-2 leading-relaxed">
            אנו משתמשים במידע כדי לספק, לשפר ולאבטח את השירות, לתקשר איתך, לשלוח תזכורות ואישורים
            (כולל דרך WhatsApp בהתאם להגדרותיך), ולתמוך בך. אנו לא מוכרים את המידע האישי שלך לצדדים שלישיים.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">4. אחסון ואבטחה</h2>
          <p className="mt-2 leading-relaxed">
            המידע מאוחסן על שרתים מאובטחים (כולל Firebase/Google Cloud). אנו נוקטים אמצעים סבירים
            להגנה על המידע מפני גישה, שינוי או מחיקה לא מורשית.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">5. עוגיות וטכנולוגיות דומות</h2>
          <p className="mt-2 leading-relaxed">
            אנו משתמשים בעוגיות ומאגרי מידע מקומיים (localStorage) לצורכי תפעול השירות, זיהוי משתמש
            ושמירת העדפות (כולל אישור תנאי שימוש ומדיניות פרטיות).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">6. זכויותיך</h2>
          <p className="mt-2 leading-relaxed">
           יש לך הזכות לגשת למידע שלך, לתקן אותו או לבקש מחיקה, בכפוף לחוק. לפנות אלינו: באמצעות דף צור קשר
            באתר או בכתובת הדוא&quot;ל שמופיעה בתנאי השימוש.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-caleno-ink">7. שינויים</h2>
          <p className="mt-2 leading-relaxed">
            שינויים במדיניות זו יפורסמו בדף זה עם עדכון תאריך &quot;עדכון אחרון&quot;. המשך שימוש בשירות לאחר
            השינוי מהווה הסכמה למדיניות המעודכנת.
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
