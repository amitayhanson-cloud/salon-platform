"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteConfig } from "@/types/siteConfig";
import {
  getTemplateForConfig,
  hairLuxuryTemplate,
  type TemplateDefinition,
} from "@/lib/templateLibrary";
import type { SalonBookingState, Booking } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { ymdLocal } from "@/lib/dateLocal";
import {
  HAIR_HERO_IMAGES,
  HAIR_ABOUT_IMAGES,
  HAIR_WORK_IMAGES,
} from "@/lib/hairImages";

function HairLuxuryPreview({
  config,
  template,
}: {
  config: SiteConfig;
  template: TemplateDefinition;
}) {
  const { colors, images } = template.assets;

  // Use config images if set, otherwise use defaults
  const heroImageUrl = config.heroImage || HAIR_HERO_IMAGES[0];
  const aboutImageUrl = config.aboutImage || HAIR_ABOUT_IMAGES[0];
  const galleryImages = HAIR_WORK_IMAGES;

  // Booking state
  const [bookingState, setBookingState] = useState<SalonBookingState | null>(null);

  // Load booking state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("salonBookingState");
    try {
      if (stored) {
        setBookingState(JSON.parse(stored));
      } else {
        setBookingState(defaultBookingState);
      }
    } catch (e) {
      console.error("Failed to parse booking state on preview", e);
      setBookingState(defaultBookingState);
    }
  }, []);

  const saveBookingState = (next: SalonBookingState) => {
    setBookingState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("salonBookingState", JSON.stringify(next));
    }
  };

  // Contact option labels
  const contactLabels: Record<
    SiteConfig["contactOptions"][number],
    { title: string; description: string }
  > = {
    phone: { title: "טלפון", description: "לחצו להתקשר אלינו" },
    whatsapp: { title: "וואטסאפ", description: "שלחו הודעה לוואטסאפ" },
    instagram: { title: "אינסטגרם", description: "עקבו אחרינו" },
    facebook: { title: "פייסבוק", description: "בקרו בעמוד שלנו" },
    contact_form: { title: "טופס יצירת קשר", description: "השאירו פרטים ונחזור אליכם" },
  };

  // Scroll functions
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Sample services if config.services is empty
  const displayServices =
    config.services.length > 0
      ? config.services
      : ["תספורת נשים", "גוונים", "החלקה"];

  const currentYear = new Date().getFullYear();

  return (
    <div
      dir="rtl"
      className="min-h-screen text-right"
      style={{
        background: `radial-gradient(circle at top, ${colors.surface} 0, ${colors.background} 55%, #000000 100%)`,
      }}
    >
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center px-4">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImageUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/75 to-black/90" />

        <div className="relative z-10 w-full max-w-4xl mx-auto text-center text-white space-y-6">
          <p className="text-sm tracking-[0.2em] text-slate-200">
            סלון יופי | עיצוב שיער
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
            {config.salonName || "שם הסלון"} – חוויית שיער ברמת לוקס
          </h1>
          <p className="text-lg sm:text-xl text-slate-200 max-w-2xl mx-auto">
            צוות מקצועי, חומרים פרימיום ואווירה פרטית ומפנקת – לכל לקוחה שמחפשת
            טיפול שיער מדויק ברמה הגבוהה ביותר.
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <button
              onClick={() => scrollToSection("booking-section")}
              className="px-8 py-3 rounded-full font-semibold shadow-lg transition"
              style={{
                backgroundColor: colors.primary,
                color: colors.textOnLight,
                boxShadow: "0 8px 24px rgba(226, 184, 87, 0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 8px 24px rgba(226, 184, 87, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 8px 24px rgba(226, 184, 87, 0.3)";
              }}
            >
              קבעי תור אונליין
            </button>
            {config.contactOptions.includes("whatsapp") && (
              <button
                onClick={() => scrollToSection("contact-section")}
                className="px-8 py-3 rounded-full font-semibold border border-slate-300/60 bg-white/5 hover:bg-white/10 text-slate-50 transition"
              >
                דברי איתנו בוואטסאפ
              </button>
            )}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-8 h-12 rounded-full border border-white/50 flex items-start justify-center p-1">
            <div className="w-1.5 h-3 rounded-full bg-white/80 animate-bounce" />
          </div>
        </div>
      </section>

      {/* About Section */}
      <section
        id="about-section"
        className="py-16 lg:py-24"
        style={{ backgroundColor: "#f8fafc" }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Text side (RTL, on the right on large screens) */}
            <div className="order-2 lg:order-1 text-right">
              <p
                className="text-sm uppercase tracking-[0.3em] font-light mb-2"
                style={{ color: colors.primary }}
              >
                על הסלון
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
                {config.salonName ? `על ${config.salonName}` : "על הסלון"}
              </h2>
              <div className="space-y-3 text-slate-600 leading-relaxed">
                <p className="text-sm">
                  {config.salonName || "הסלון"} הוא סלון שיער בוטיק המתמחה בתספורות
                  מדויקות, צבעי שיער מתקדמים וטיפולי פרימיום לשיקום וחיזוק השיער.
                </p>
                <p className="text-sm">
                  צוות מקצועי, אווירה אינטימית ושימת לב לכל פרט קטן – כדי שכל
                  לקוחה תצא עם תחושת לוקס אמיתית.
                </p>
                {config.city && (
                  <p className="text-sm font-medium text-slate-700 mt-2">
                    ממוקם ב{config.city} והסביבה.
                  </p>
                )}
                {config.specialNote && (
                  <p style={{ color: colors.primary }} className="text-sm italic">
                    {config.specialNote}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="bg-white border border-slate-200 rounded-full px-4 py-2 text-xs text-center shadow-sm">
                  +15 שנות ניסיון
                </div>
                <div className="bg-white border border-slate-200 rounded-full px-4 py-2 text-xs text-center shadow-sm">
                  אווירה פרטית ומוקפדת
                </div>
                <div className="bg-white border border-slate-200 rounded-full px-4 py-2 text-xs text-center shadow-sm">
                  חומרים פרימיום בלבד
                </div>
              </div>
            </div>

            {/* Image side */}
            <div className="order-1 lg:order-2">
              <div className="relative overflow-hidden rounded-3xl shadow-lg bg-slate-200">
                <img
                  src={aboutImageUrl}
                  alt="תמונה מתוך הסלון"
                  className="w-full h-80 object-cover"
                />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/10 via-transparent to-white/5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section
        id="services-section"
        className="py-16 lg:py-24"
        style={{ backgroundColor: "#f8fafc" }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8 space-y-8">
          <div className="text-right space-y-3">
            <p
              className="text-sm uppercase tracking-[0.3em] font-light"
              style={{ color: colors.primary }}
            >
              השירותים שלנו
            </p>
            <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide text-slate-900">
              שירותים מקצועיים מותאמים אישית
            </h2>
            <p className="text-slate-600 max-w-2xl">
              כל שירות מבוצע בקפידה על ידי צוות מקצועי ומנוסה, תוך שימוש
              בחומרים איכותיים וטכניקות מתקדמות.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {displayServices.map((service, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl shadow-md p-6 border border-slate-100 hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <h3
                  className="text-xl font-serif font-light mb-3"
                  style={{ color: colors.primary }}
                >
                  {service}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                  שירות מדויק המותאם אישית למבנה הפנים וסגנון החיים שלך.
                </p>
                <p className="text-xs text-slate-500">
                  מחירים משתנים לפי אורך ועובי שיער
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section
        id="gallery-section"
        className="py-16 lg:py-24"
        style={{ backgroundColor: colors.surface }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="mb-8 text-right">
            <h2
              className="text-2xl sm:text-3xl font-bold"
              style={{ color: colors.textOnDark }}
            >
              גלריית עבודות
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: colors.textOnDark, opacity: 0.8 }}
            >
              מבחר קטן מהעבודות והאווירה בסלון.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {galleryImages.map((src, index) => (
              <div
                key={`${src}-${index}`}
                className="relative overflow-hidden rounded-2xl bg-slate-200 shadow-sm"
              >
                <img
                  src={src}
                  alt="תמונה מהסלון"
                  className="h-64 w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section
        id="reviews-section"
        className="py-16 lg:py-24"
        style={{ backgroundColor: "#f8fafc" }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8 space-y-8">
          <div className="text-right space-y-3">
            <p
              className="text-sm uppercase tracking-[0.3em] font-light"
              style={{ color: colors.primary }}
            >
              מה הלקוחות אומרים
            </p>
            <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide text-slate-900">
              המלצות מלקוחות מרוצים
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "שירות מעולה וצוות מקצועי! מאוד מרוצה מהתוצאה.",
              "הסלון נקי ומסודר, והטיפול היה מדויק ומהיר.",
              "ממליצה בחום! חוויה נהדרת מההתחלה ועד הסוף.",
            ].map((review, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl shadow-md p-6 border border-slate-100"
              >
                <p className="text-slate-700 leading-relaxed text-right">
                  &quot;{review}&quot;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Section */}
      {config.bookingOption !== "none" && bookingState && (
        <section id="booking-section" className="py-16 lg:py-24 bg-slate-100">
          <div className="max-w-4xl mx-auto px-4 lg:px-8">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-6 lg:p-10">
              <div className="text-right space-y-3 mb-8">
                <p
                  className="text-sm uppercase tracking-[0.3em] font-light"
                  style={{ color: colors.primary }}
                >
                  קביעת תור אונליין
                </p>
                <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide text-slate-900">
                  קבעו תור עכשיו
                </h2>
                <p className="text-slate-600 max-w-2xl">
                  בחרו תאריך, שעה ומעצב שיער – ואנחנו נחזור אליכם לאישור התור.
                </p>
              </div>

              <BookingForm bookingState={bookingState} onChange={saveBookingState} />
            </div>
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section id="contact-section" className="py-16 lg:py-24 bg-slate-100">
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-12 items-start">
            {/* Map placeholder - left */}
            <div className="mb-8 lg:mb-0">
              <div className="bg-white rounded-3xl aspect-[4/3] flex flex-col items-center justify-center shadow-md border border-slate-200">
                <p className="text-slate-600 text-sm mb-2">
                  כאן תופיע מפה אינטראקטיבית (Google Maps / Waze)
                </p>
                {config.city && (
                  <p className="text-xs text-slate-800 font-medium">
                    מיקום: {config.city}
                    {config.neighborhood && ` – ${config.neighborhood}`}
                  </p>
                )}
              </div>
            </div>

            {/* Contact methods - right */}
            <div className="space-y-4">
              <div className="text-right space-y-3 mb-6">
                <p
                  className="text-sm uppercase tracking-[0.3em] font-light"
                  style={{ color: colors.primary }}
                >
                  צור קשר
                </p>
                <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide text-slate-900">
                  בואו נפגש
                </h2>
              </div>
              {config.contactOptions.map((option) => {
                const label = contactLabels[option];
                if (!label) return null;
                return (
                  <div
                    key={option}
                    className="bg-white border border-slate-200 rounded-2xl p-4 flex justify-between items-center hover:shadow-md transition-colors shadow-sm"
                  >
                    <div className="text-right">
                      <h3
                        className="font-medium mb-1"
                        style={{ color: colors.primary }}
                      >
                        {label.title}
                      </h3>
                      <p className="text-sm text-slate-600">{label.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 border-t"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.surface,
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-right">
          <p style={{ color: colors.textOnDark }} className="text-sm">
            © {currentYear} {config.salonName || "הסלון שלך"} – נבנה ב-Caleno
          </p>
        </div>
      </footer>

      {/* Floating WhatsApp button */}
      {config.contactOptions.includes("whatsapp") && (
        <button
          type="button"
          className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-30 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl w-14 h-14 flex items-center justify-center text-2xl transition-colors"
          aria-label="פתח וואטסאפ"
        >
          ⟳
        </button>
      )}
    </div>
  );
}

export default function PreviewPage() {
  const router = useRouter();
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // We are in the browser
    if (typeof window === "undefined") return;

    setLoading(true);

    // Read the config the wizard saved
    const raw = window.sessionStorage.getItem("latestSiteConfig");
    if (!raw) {
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SiteConfig;
      setSiteConfig(parsed);
      setError(null);
    } catch (e) {
      console.error("Failed to parse latestSiteConfig", e);
      setError("שגיאה בקריאת נתוני האתר. נסה לחזור לבונה האתר.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Loading state
  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "#050816" }}
      >
        <div
          className="border rounded-2xl shadow-sm p-6 max-w-md w-full text-right space-y-3"
          style={{
            backgroundColor: "#0f172a",
            borderColor: "#1e293b",
            color: "#f9fafb",
          }}
        >
          <h1 className="text-lg font-semibold">טוען את האתר...</h1>
        </div>
      </div>
    );
  }

  // No config in sessionStorage – send user back to wizard
  if (!siteConfig) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "#050816" }}
      >
        <div
          className="border rounded-2xl shadow-sm p-6 max-w-md w-full text-right space-y-3"
          style={{
            backgroundColor: "#0f172a",
            borderColor: "#1e293b",
            color: "#f9fafb",
          }}
        >
          <h1 className="text-lg font-semibold">לא נמצאו נתוני אתר</h1>
          <p className="text-sm opacity-80">חזרו למילוי השאלון.</p>
          <button
            type="button"
            onClick={() => router.push("/builder")}
            className="mt-2 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "#e2b857" }}
          >
            חזרה לבונה האתר
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "#050816" }}
      >
        <div
          className="border rounded-2xl shadow-sm p-6 max-w-md w-full text-right space-y-4"
          style={{
            backgroundColor: "#0f172a",
            borderColor: "#dc2626",
            color: "#f9fafb",
          }}
        >
          <h1 className="text-lg font-semibold">שגיאה בטעינת האתר</h1>
          <p className="text-sm opacity-80">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/builder")}
            className="mt-2 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "#e2b857" }}
          >
            חזרה לבונה האתר
          </button>
        </div>
      </div>
    );
  }

  // Get template and render
  const template = siteConfig
    ? getTemplateForConfig(siteConfig)
    : hairLuxuryTemplate;

  return <HairLuxuryPreview config={siteConfig} template={template} />;
}

function BookingForm({
  bookingState,
  onChange,
}: {
  bookingState: SalonBookingState;
  onChange: (next: SalonBookingState) => void;
}) {
  const workers = bookingState.workers;

  const todayStr = ymdLocal(new Date());

  const [date, setDate] = useState<string>(todayStr);
  const [time, setTime] = useState<string>("10:00");
  const [workerId, setWorkerId] = useState<string>(workers[0]?.id ?? "");
  const [clientName, setClientName] = useState<string>("");
  const [service, setService] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !date || !time) {
      setStatusMsg("יש לבחור עובד, תאריך ושעה.");
      return;
    }

    const worker = workers.find((w) => w.id === workerId);
    const newBooking: Booking = {
      id: `b_${Date.now()}`,
      workerId,
      workerName: worker?.name ?? "עובד",
      date,
      startTime: time,
      clientName: clientName || "לקוח ללא שם",
      service: service || undefined,
      notes: notes || undefined,
    };

    const nextState: SalonBookingState = {
      ...bookingState,
      bookings: [...bookingState.bookings, newBooking],
    };
    onChange(nextState);

    setStatusMsg("הבקשה לתור נשלחה. נחזור אליך לאישור.");
    setTimeout(() => setStatusMsg(""), 3000);

    // Reset some fields
    setClientName("");
    setService("");
    setNotes("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            תאריך
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            שעה
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            עובד
          </label>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            שם הלקוח
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="איך לפנות אליך?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            שירות מבוקש
          </label>
          <input
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="למשל: תספורת, צבע, פנים וכו׳"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          הערות (לא חובה)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
          placeholder="הערות מיוחדות על התור…"
        />
      </div>

      {statusMsg && (
        <div className="text-xs text-emerald-600">{statusMsg}</div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
        >
          שלח בקשה לתור
        </button>
      </div>
    </form>
  );
}
