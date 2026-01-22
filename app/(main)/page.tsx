"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { routeAfterAuth } from "@/lib/authRedirect";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    salonName: "",
    city: "",
    interest: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleLogin = () => {
    router.push("/login");
  };

  const handleSignup = () => {
    router.push("/signup");
  };

  const handleGoToDashboard = async () => {
    if (!user) return;
    
    try {
      const redirectPath = await routeAfterAuth(user.id);
      router.replace(redirectPath);
    } catch (error) {
      console.error("Error determining redirect path:", error);
      // Fallback: check if user has siteId directly
      if (user.siteId) {
        router.replace(`/site/${user.siteId}/admin`);
      } else {
        router.replace("/builder");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("Form data:", formData);
    setFormSubmitted(true);
    // Reset form after 5 seconds
    setTimeout(() => {
      setFormSubmitted(false);
      setFormData({
        fullName: "",
        phone: "",
        email: "",
        salonName: "",
        city: "",
        interest: "",
      });
    }, 5000);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <>
      {/* Section A - Hero */}
      <section className="relative bg-gradient-to-b from-sky-50 via-white to-slate-50 py-16 md:py-24 overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(14, 165, 233, 0.1) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}></div>
        </div>
        
        <div className="container mx-auto px-4 max-w-5xl relative z-10">
          <div className="text-center" dir="rtl">
            {/* Badge / Pill */}
            <div className="inline-flex items-center px-4 py-1.5 bg-sky-100/80 border border-sky-200/60 rounded-full mb-6">
              <span className="text-sm font-medium text-sky-700">
                פתרון מושלם לבעלי סלונים
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight max-w-4xl mx-auto">
              בונים אתר מושלם לסלון שלך בדקות
            </h1>

            {/* Supporting Paragraph */}
            <p className="text-base md:text-lg text-slate-600 mb-8 leading-relaxed max-w-2xl mx-auto">
              בלי צורך בידע טכני או תכנות. בנו במיוחד לספריות, מכוני יופי
              וספא.
              <br />
              בינה מלאכותית עושה את העבודה הקשה עבורך.
            </p>

            {/* CTA Buttons Row */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              {user ? (
                // User is logged in - show "Go to Dashboard" button
                <button
                  onClick={handleGoToDashboard}
                  disabled={loading}
                  className="inline-block px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-full shadow-sm shadow-sky-100 transition-colors text-center disabled:opacity-50"
                >
                  {loading ? "טוען..." : "לדשבורד"}
                </button>
              ) : (
                // User not logged in - show login and signup buttons
                <>
                  <button
                    onClick={handleLogin}
                    className="inline-block px-6 py-3 bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-full font-medium transition-colors text-center"
                  >
                    התחברות
                  </button>
                  <button
                    onClick={handleSignup}
                    className="inline-block px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-full shadow-sm shadow-sky-100 transition-colors text-center"
                  >
                    הרשמה
                  </button>
                </>
              )}
              <Link
                href="#how-it-works"
                className="inline-block px-6 py-3 bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-full font-medium transition-colors text-center"
              >
                צפה בדוגמת אתר
              </Link>
            </div>

            {/* Preview Card */}
            <div className="max-w-md mx-auto">
              <div className="bg-white rounded-lg p-6 md:p-8 h-64 md:h-80 flex flex-col justify-between border border-sky-100 shadow-md">
                <div>
                  <div className="bg-sky-100 h-1 w-16 rounded-full mb-3"></div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2 text-right">
                    סלון יופי דוגמה
                  </h3>
                  <p className="text-slate-600 text-right text-sm mb-4">
                    טיפוח, עיצוב שיער וטיפולים מקצועיים
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="h-2 bg-slate-200 rounded"></div>
                  <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-2 bg-slate-200 rounded w-1/2"></div>
                </div>
                <p className="text-xs text-slate-400 text-center mt-4">
                  תצוגה מקדימה של האתר שלך
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section B - Who is this for */}
      <section
        id="for-whom"
        className="bg-white py-12 md:py-16 border-t border-sky-100"
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-right mb-8 md:mb-12">
            <span className="inline-block h-1 w-10 rounded-full bg-sky-300 mb-3"></span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
              מותאם לבעלי סלונים עסוקים
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            <div className="text-right">
              <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">
                לא צריך לדעת לבנות אתרים
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                הכל פשוט ויזואלי. אין צורך בידע טכני או ניסיון קודם.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">
                עבודה מלאה בנייד ובמחשב
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                האתר שלך נראה מושלם על כל מכשיר - טלפון, טאבלט ומחשב.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">
                אתר שנראה מקצועי מהדקה הראשונה
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                עיצוב מודרני ומקצועי שמתאים בדיוק לסלון שלך.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section C - How it works */}
      <section
        id="how-it-works"
        className="bg-sky-50 py-12 md:py-16 border-t border-sky-100"
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-right mb-8 md:mb-12">
            איך זה עובד?
          </h2>
          <div className="grid md:grid-cols-4 gap-6 md:gap-8">
            <div className="text-right">
              <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xl font-bold mb-4">
                1
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                עונים על כמה שאלות קצרות על הסלון
              </h3>
              <p className="text-slate-600 text-sm">
                מספרים לנו על השירותים, הסגנון והפרטים החשובים.
              </p>
            </div>
            <div className="text-right">
              <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xl font-bold mb-4">
                2
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                המערכת בונה עבורך אתר מותאם אישית עם AI
              </h3>
              <p className="text-slate-600 text-sm">
                הבינה המלאכותית יוצרת אתר מותאם במיוחד לסלון שלך.
              </p>
            </div>
            <div className="text-right">
              <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xl font-bold mb-4">
                3
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                אתה בוחר עיצוב ואלמנטים בסיסיים
              </h3>
              <p className="text-slate-600 text-sm">
                מתאימים צבעים, סגנון ותוכן לפי הטעם שלך.
              </p>
            </div>
            <div className="text-right">
              <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xl font-bold mb-4">
                4
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                מפרסמים את האתר ומשתפים לקוחות
              </h3>
              <p className="text-slate-600 text-sm">
                האתר שלך מוכן וזמין ללקוחות תוך דקות.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section D - Features */}
      <section className="bg-white py-12 md:py-16 border-t border-sky-100">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-right mb-8 md:mb-12">
            מה מקבלים עם SalonPlatform?
          </h2>
          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            <div className="text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                <span className="text-sky-500">•</span> אתר מותאם לנייד
              </h3>
              <p className="text-slate-600 text-sm">
                האתר שלך נראה מושלם על כל מכשיר - אוטומטית.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                <span className="text-sky-500">•</span> אפשרות להוספת הזמנות אונליין (בהמשך)
              </h3>
              <p className="text-slate-600 text-sm">
                לקוחות יוכלו להזמין תורים ישירות מהאתר.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                <span className="text-sky-500">•</span> תמונות שיווקיות עם AI או מהטלפון שלך
              </h3>
              <p className="text-slate-600 text-sm">
                הוסף תמונות משלך או השתמש בתמונות שנוצרו ב-AI.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                <span className="text-sky-500">•</span> עמוד מחירים, צוות, ביקורות ועוד
              </h3>
              <p className="text-slate-600 text-sm">
                כל מה שצריך כדי להציג את הסלון שלך בצורה מקצועית.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                <span className="text-sky-500">•</span> עדכון קל ומהיר
              </h3>
              <p className="text-slate-600 text-sm">
                עדכן מחירים, שעות פעילות ותוכן בקלות ובמהירות.
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                <span className="text-sky-500">•</span> תמיכה בעברית מלאה
              </h3>
              <p className="text-slate-600 text-sm">
                ממשק בעברית ותמיכה מלאה בשפה העברית.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section E - Pricing teaser */}
      <section
        id="pricing"
        className="bg-white py-12 md:py-16 border-t border-sky-100"
      >
        <div className="container mx-auto px-4 max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-right mb-8">
            מחירים
          </h2>
          <div className="bg-white rounded-2xl p-6 md:p-8 border border-sky-100 shadow-sm text-right">
            <h3 className="text-xl font-semibold text-sky-800 mb-4">
              חבילה חודשית לבעלי סלונים
            </h3>
            <p className="text-2xl font-bold text-slate-900 mb-6">
              <span className="text-sky-600 text-lg font-semibold">החל מ-</span>XXX ₪ לחודש
            </p>
            <ul className="space-y-3 mb-6 text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-sky-500">✓</span>
                <span>אתר מותאם אישית לסלון שלך</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">✓</span>
                <span>עדכונים ללא הגבלה</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">✓</span>
                <span>תמיכה טכנית בעברית</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">✓</span>
                <span>אירוח מהיר ואמין</span>
              </li>
            </ul>
            <p className="text-sm text-slate-600">
              השאר פרטים ונשלח לך הצעה מתאימה.
            </p>
          </div>
        </div>
      </section>

      {/* Section F - Lead form */}
      <section className="bg-white py-12 md:py-16 border-t border-sky-100">
        <div className="container mx-auto px-4 max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-right mb-8">
            השאירו פרטים וקבלו הדגמה אישית
          </h2>
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-lg shadow-sky-50 p-6 sm:p-8 border border-sky-100"
          >
            {formSubmitted ? (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 mb-6 text-right">
                קיבלנו את הפרטים ונחזור אליך בהקדם.
              </div>
            ) : null}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium text-slate-700 mb-2 text-right"
                >
                  שם מלא
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-sky-500 focus:border-sky-500 text-right"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-slate-700 mb-2 text-right"
                >
                  טלפון
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-sky-500 focus:border-sky-500 text-right"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 mb-2 text-right"
                >
                  אימייל
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-sky-500 focus:border-sky-500 text-right"
                />
              </div>
              <div>
                <label
                  htmlFor="salonName"
                  className="block text-sm font-medium text-slate-700 mb-2 text-right"
                >
                  שם הסלון
                </label>
                <input
                  type="text"
                  id="salonName"
                  name="salonName"
                  value={formData.salonName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-sky-500 focus:border-sky-500 text-right"
                />
              </div>
              <div>
                <label
                  htmlFor="city"
                  className="block text-sm font-medium text-slate-700 mb-2 text-right"
                >
                  עיר
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-sky-500 focus:border-sky-500 text-right"
                />
              </div>
              <div>
                <label
                  htmlFor="interest"
                  className="block text-sm font-medium text-slate-700 mb-2 text-right"
                >
                  מה מעניין אותך?
                </label>
                <select
                  id="interest"
                  name="interest"
                  value={formData.interest}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-sky-500 focus:border-sky-500 text-right bg-white"
                >
                  <option value="">בחר אפשרות</option>
                  <option value="talk">רוצה לדבר עם נציג</option>
                  <option value="start">רוצה להתחיל לבד</option>
                  <option value="info">מחפש רק מידע בשלב זה</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-full shadow-sm shadow-sky-100 transition-colors"
              >
                שלח פרטים
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Section G - FAQ */}
      <section className="py-12 md:py-16 border-t border-sky-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-right mb-8 md:mb-12">
            שאלות נפוצות
          </h2>
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:border-sky-200 hover:shadow-md transition text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                האם צריך כרטיס אשראי כדי להתחיל?
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                לא, אפשר להתחיל בחינם ולראות איך האתר נראה. תשלום רק כשאתה
                מוכן לפרסם את האתר.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:border-sky-200 hover:shadow-md transition text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                האם אפשר לשנות את האתר אחרי הבניה?
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                כן, בהחלט! אפשר לעדכן תוכן, תמונות, מחירים וכל דבר אחר בכל
                עת, ללא הגבלה.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:border-sky-200 hover:shadow-md transition text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                האם אפשר לחבר מערכת הזמנות קיימת?
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                כרגע אנחנו עובדים על מערכת הזמנות משלנו. בעתיד נוכל לבדוק
                אפשרויות לחיבור למערכות קיימות.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:border-sky-200 hover:shadow-md transition text-right">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                כמה זמן לוקח לבנות את האתר?
              </h3>
              <p className="text-slate-600 text-sm md:text-base">
                התהליך כולו לוקח כ-15-30 דקות. אחרי שתמלא את הפרטים, האתר
                מוכן תוך דקות.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
