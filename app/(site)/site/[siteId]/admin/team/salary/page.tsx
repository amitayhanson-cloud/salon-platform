"use client";

import type { SiteConfig } from "@/types/siteConfig";

const SERVICE_OPTIONS: Record<SiteConfig["salonType"], string[]> = {
  hair: ["תספורת", "צבע", "פן", "החלקה", "טיפולי שיער"],
  nails: ["מניקור", "פדיקור", "לק ג׳ל", "בניית ציפורניים", "טיפול כף רגל"],
  barber: ["תספורת גברים", "עיצוב זקן", "תספורת ילדים"],
  spa: ["עיסוי", "טיפולי פנים", "טיפול גוף", "שיאצו", "רפלקסולוגיה"],
  mixed: [
    "תספורת",
    "צבע",
    "פן",
    "לק ג׳ל",
    "מניקור",
    "פדיקור",
    "עיסוי",
    "טיפולי פנים",
  ],
  other: [],
};


const vibeLabels: Record<SiteConfig["vibe"], string> = {
  luxury: "סגנון יוקרתי",
  clean: "סגנון נקי ורך",
  colorful: "סגנון צבעוני וכיפי",
  spa: "לא בשימוש כרגע",
  surprise: "לא בשימוש כרגע",
};

const photosOptionLabels: Record<SiteConfig["photosOption"], string> = {
  own: "אני מעלה תמונות שלי",
  ai: "AI ייצור תמונות בשבילי",
  mixed: "שילוב של שניהם",
};


const bookingOptionLabels: Record<SiteConfig["bookingOption"], string> = {
  simple_form: "כן, אני רוצה הזמנות אונליין",
  none: "לא, בלי הזמנות אונליין כרגע",
  booking_system: "יש לי כבר מערכת הזמנות ואני רוצה לחבר אותה",
};

const extraPageLabels: Record<SiteConfig["extraPages"][number], string> = {
  reviews: "ביקורות מלקוחות",
  faq: "שאלות נפוצות",
};

const salonTypeLabels: Record<SiteConfig["salonType"], string> = {
  hair: "ספרות / עיצוב שיער",
  nails: "מניקור / פדיקור",
  barber: "ברברשופ",
  spa: "ספא / טיפולי גוף",
  mixed: "משולב",
  other: "אחר",
};



function AdminSalaryTab() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-4">
      <h2 className="text-xl font-bold text-slate-900">שכר ותשלומים</h2>
      <p className="text-xs text-slate-500">
        כאן תוכל בעתיד לראות סיכומי הכנסות, עמלות עובדים, ושכר חודשי לפי תורים
        שבוצעו. כרגע זה מסך דמה כדי להגדיר את המבנה.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">הכנסות החודש (סה״כ)</div>
          <div className="text-lg font-semibold text-slate-900">
            ₪ 0 (דוגמה)
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">שכר משוער לעובדים</div>
          <div className="text-lg font-semibold text-slate-900">
            ₪ 0 (דוגמה)
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">
            תורים שבוצעו החודש
          </div>
          <div className="text-lg font-semibold text-slate-900">
            0 (דוגמה)
          </div>
        </div>
      </div>
    </div>
  );
}



export default function SalaryPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">משכורות</h1>
        <p className="text-sm text-slate-500 mt-1">
          כאן תוכל לראות סיכומי הכנסות, עמלות עובדים, ושכר חודשי
        </p>
      </div>

      <AdminSalaryTab />
    </div>
  );
}
