"use client";

import { useState, useEffect } from "react";
import type { SiteConfig } from "@/types/siteConfig";

interface LuxurySalonTemplateProps {
  config: SiteConfig;
}

export function LuxurySalonTemplate({ config }: LuxurySalonTemplateProps) {
  // Booking state (reused from BaseSalonTemplate)
  const [selectedService, setSelectedService] = useState(
    config.services.length > 0 
      ? config.services[0]
      : ""
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [bookingFormData, setBookingFormData] = useState({
    name: "",
    phone: "",
    note: "",
  });
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Generate next 7 days
  const [availableDays, setAvailableDays] = useState<Date[]>([]);

  useEffect(() => {
    const days: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date);
    }
    setAvailableDays(days);
    setSelectedDate(today);
  }, []);

  // Time slots
  const timeSlots = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
  ];

  // Get salon type label
  const salonTypeLabel =
    config.salonType === "nails"
      ? "סלון ציפורניים"
      : config.salonType === "barber"
        ? "ברברשופ"
        : config.salonType === "spa"
          ? "ספא"
          : config.salonType === "mixed"
            ? "סלון משולב"
            : "סלון יופי";

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

  const handleBookingSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBookingError(null);

    // Validation
    if (
      (config.services.length > 0 && !selectedService) ||
      !selectedDate ||
      !selectedTime ||
      !bookingFormData.name.trim() ||
      !bookingFormData.phone.trim()
    ) {
      setBookingError("יש למלא את כל הפרטים הנדרשים.");
      return;
    }

    // Format date for console
    const dateStr = selectedDate
      ? `${selectedDate.getDate()}/${selectedDate.getMonth() + 1}/${selectedDate.getFullYear()}`
      : "";

    const bookingData = {
      salonName: config.salonName,
      selectedService: config.services.length > 0 ? selectedService : "שירות כללי בסלון",
      selectedDate: dateStr,
      selectedTime,
      name: bookingFormData.name,
      phone: bookingFormData.phone,
      note: bookingFormData.note || "",
    };

    console.log("Booking request:", bookingData);

    setBookingSubmitted(true);
    // Clear only text fields, keep date/time
    setBookingFormData({
      name: "",
      phone: "",
      note: "",
    });
  };

  const formatDayName = (date: Date) => {
    const days = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
    return days[date.getDay()];
  };

  const formatDate = (date: Date) => {
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  const isSameDay = (date1: Date | null, date2: Date) => {
    if (!date1) return false;
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  };

  // Sample services if config.services is empty
  const displayServices =
    config.services.length > 0
      ? config.services
      : ["תספורת נשים", "גוונים", "החלקה"];

  const currentYear = new Date().getFullYear();

  return (
    <div dir="rtl" className="min-h-screen bg-[#050509] text-slate-50">
      {/* Hero Section - Full Viewport */}
      <section className="relative min-h-screen flex flex-col">
        {/* Background with gradient and texture */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(250,204,21,0.05),transparent_70%)]" />
        </div>
        <div className="absolute inset-0 bg-black/40" />

        {/* Top Navigation Bar */}
        <nav className="relative z-20 sticky top-0 bg-black/40 backdrop-blur-md border-b border-amber-500/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="text-lg font-serif text-amber-400 tracking-wide">
                {config.salonName || "Salon Name"}
              </div>
              <div className="flex items-center gap-6 text-xs uppercase tracking-[0.2em]">
                <button
                  onClick={() => scrollToSection("services-section")}
                  className="text-slate-300 hover:text-amber-400 transition-colors"
                >
                  שירותים
                </button>
                <button
                  onClick={() => scrollToSection("about-section")}
                  className="text-slate-300 hover:text-amber-400 transition-colors"
                >
                  על הסלון
                </button>
                <button
                  onClick={() => scrollToSection("gallery-section")}
                  className="text-slate-300 hover:text-amber-400 transition-colors"
                >
                  גלריה
                </button>
                <button
                  onClick={() => scrollToSection("booking-section")}
                  className="text-slate-300 hover:text-amber-400 transition-colors"
                >
                  קביעת תור
                </button>
                <button
                  onClick={() => scrollToSection("contact-section")}
                  className="text-slate-300 hover:text-amber-400 transition-colors"
                >
                  צור קשר
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 flex-1 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-3xl ml-auto text-right flex flex-col gap-6 py-24">
              <p className="text-sm uppercase tracking-[0.3em] text-amber-400 font-light">
                {salonTypeLabel} פרימיום
              </p>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-serif font-light leading-tight tracking-wide">
                {config.salonName || "הסלון שלך"}
                <br />
                <span className="text-amber-400">חוויית שיער ברמת לוקס</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-2xl">
                חוויה ייחודית המשלבת מקצועיות ברמה הגבוהה ביותר, חומרים
                פרימיום ואווירה פרטית ומוקפדת. כל לקוח מקבל טיפול מותאם אישית
                ומעקב מקצועי.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  onClick={() => scrollToSection("booking-section")}
                  className="bg-amber-400 text-slate-950 px-8 py-3 rounded-full font-semibold hover:bg-amber-500 transition-colors shadow-[0_8px_24px_rgba(250,204,21,0.3)]"
                >
                  קבעו תור אונליין
                </button>
                <button
                  onClick={() => scrollToSection("services-section")}
                  className="border border-amber-400 text-amber-300 px-8 py-3 rounded-full hover:bg-amber-400/10 transition-colors"
                >
                  צפו בשירותים
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="bg-[#050509] text-slate-50">
        <main className="max-w-6xl mx-auto px-4 lg:px-0 space-y-24 py-16">
          {/* About Section */}
          <section id="about-section" className="lg:grid lg:grid-cols-2 lg:gap-12 items-center">
            {/* Image placeholder - left */}
            <div className="mb-8 lg:mb-0">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-3xl aspect-[4/3] flex items-center justify-center shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                <span className="text-slate-500 text-sm">תמונה מהסלון</span>
              </div>
            </div>

            {/* Content - right */}
            <div className="text-right space-y-6">
              <p className="text-sm uppercase tracking-[0.3em] text-amber-400 font-light">
                על הסלון
              </p>
              <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide">
                {config.salonName ? `על ${config.salonName}` : "על הסלון"}
              </h2>
              <div className="space-y-4 text-slate-300 leading-relaxed">
                <p>
                  {salonTypeLabel} מודרני המתמחה במתן שירותים מקצועיים ברמה
                  הגבוהה ביותר. אנו מציעים חוויה ייחודית המשלבת מקצועיות,
                  איכות ואווירה פרטית ומוקפדת.
                </p>
                <p>
                  הצוות שלנו מורכב מסטייליסטים מנוסים ומקצועיים, המחויבים
                  לספק תוצאות מושלמות ולהעניק לכל לקוח חוויה אישית ובלתי נשכחת.
                </p>
                {config.specialNote && (
                  <p className="text-amber-400/80 italic">{config.specialNote}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="bg-white/5 border border-amber-400/20 rounded-full px-4 py-2 text-xs text-center">
                  +15 שנות ניסיון
                </div>
                <div className="bg-white/5 border border-amber-400/20 rounded-full px-4 py-2 text-xs text-center">
                  אווירה פרטית ומוקפדת
                </div>
                <div className="bg-white/5 border border-amber-400/20 rounded-full px-4 py-2 text-xs text-center">
                  חומרים פרימיום בלבד
                </div>
              </div>
            </div>
          </section>

          {/* Services Section */}
          <section id="services-section" className="space-y-8">
            <div className="text-right space-y-3">
              <p className="text-sm uppercase tracking-[0.3em] text-amber-400 font-light">
                השירותים שלנו
              </p>
              <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide">
                שירותים מקצועיים מותאמים אישית
              </h2>
              <p className="text-slate-300 max-w-2xl">
                כל שירות מבוצע בקפידה על ידי צוות מקצועי ומנוסה, תוך שימוש
                בחומרים איכותיים וטכניקות מתקדמות.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {displayServices.map((service, idx) => (
                <div
                  key={idx}
                  className="bg-[#101018] border border-slate-800 rounded-2xl p-6 hover:border-amber-400/60 hover:-translate-y-1 transition-all duration-300 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                >
                  <h3 className="text-xl font-serif font-light mb-3 text-amber-400">
                    {service}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed mb-3">
                    שירות מדויק המותאם אישית למבנה הפנים וסגנון החיים שלך.
                  </p>
                  <p className="text-xs text-slate-500">
                    מחירים משתנים לפי אורך ועובי שיער
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Gallery Section */}
          <section id="gallery-section" className="space-y-8">
            <div className="text-right space-y-3">
              <p className="text-sm uppercase tracking-[0.3em] text-amber-400 font-light">
                גלריית השראה
              </p>
              <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide">
                עבודות אחרונות
              </h2>
              <p className="text-slate-300 max-w-2xl">
                צפו בעבודות שלנו ותוצאות מרשימות מלקוחות מרוצים.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({
                length: Math.min(6, Math.max(3, displayServices.length || 3)),
              }).map((_, idx) => {
                const labels = [
                  "סטיילינג ערב",
                  "גוונים עדינים",
                  "תספורת קצרה מודרנית",
                  "החלקה מקצועית",
                  "צבע מתקדם",
                  "טיפול שיער פרימיום",
                ];
                return (
                  <div
                    key={idx}
                    className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                  >
                    <div className="absolute inset-0 bg-black/30" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <span className="text-xs text-amber-400 bg-black/50 rounded-full px-3 py-1.5 backdrop-blur-sm">
                        {labels[idx] || "עבודה מקצועית"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Booking Section */}
          <section id="booking-section" className="space-y-8">
            <div className="bg-[#101018] rounded-3xl border border-amber-400/25 shadow-[0_24px_80px_rgba(0,0,0,0.7)] p-6 lg:p-10">
              <div className="text-right space-y-3 mb-8">
                <p className="text-sm uppercase tracking-[0.3em] text-amber-400 font-light">
                  קביעת תור אונליין
                </p>
                <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide">
                  קבעו תור עכשיו
                </h2>
                <p className="text-slate-300 max-w-2xl">
                  בחרו שירות, יום ושעה מתאימה והשאירו פרטים. נחזור אליכם לאישור.
                </p>
              </div>

              {bookingSubmitted ? (
                <div className="p-4 bg-amber-400/10 border border-amber-400/30 rounded-lg text-right">
                  <p className="text-sm text-amber-400">
                    הבקשה נשלחה. נחזור אליך לאישור התור.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleBookingSubmit} className="space-y-6">
                  {/* Service Selection */}
                  <div>
                    <label
                      htmlFor="service"
                      className="block text-sm font-medium text-slate-300 mb-2 text-right"
                    >
                      בחר שירות
                    </label>
                    {config.services.length > 0 ? (
                      <select
                        id="service"
                        value={selectedService}
                        onChange={(e) => setSelectedService(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-[#050509] text-slate-50 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                      >
                        {config.services.map((service, idx) => {
                          const serviceName = service;
                          return (
                            <option key={idx} value={serviceName}>
                              {serviceName}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="w-full rounded-lg border border-slate-700 bg-[#050509] px-4 py-3 text-right text-slate-500">
                        שירות כללי בסלון
                      </div>
                    )}
                  </div>

                  {/* Calendar - Next 7 Days */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-3 text-right">
                      בחר יום
                    </label>
                    <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-7 sm:overflow-visible">
                      {availableDays.map((day, idx) => {
                        const isSelected = isSameDay(selectedDate, day);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedDate(day)}
                            className={`flex-shrink-0 flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-colors min-w-[80px] ${
                              isSelected
                                ? "bg-amber-400 text-slate-950 border-amber-400"
                                : "bg-[#050509] text-slate-300 border-slate-700 hover:border-amber-400/60"
                            }`}
                          >
                            <span className="text-xs font-medium">
                              {formatDayName(day)}
                            </span>
                            <span className="text-sm font-semibold mt-1">
                              {formatDate(day)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Slots */}
                  {selectedDate && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-3 text-right">
                        בחר שעה
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                        {timeSlots.map((time) => {
                          const isSelected = selectedTime === time;
                          return (
                            <button
                              key={time}
                              type="button"
                              onClick={() => setSelectedTime(time)}
                              className={`px-4 py-2 rounded-full border-2 transition-colors text-sm font-medium ${
                                isSelected
                                  ? "bg-amber-400 text-slate-950 border-amber-400"
                                  : "bg-[#050509] text-slate-300 border-slate-700 hover:border-amber-400/60"
                              }`}
                            >
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Personal Details */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-slate-300 mb-2 text-right"
                      >
                        שם מלא
                      </label>
                      <input
                        type="text"
                        id="name"
                        value={bookingFormData.name}
                        onChange={(e) =>
                          setBookingFormData({
                            ...bookingFormData,
                            name: e.target.value,
                          })
                        }
                        required
                        className="w-full rounded-lg border border-slate-700 bg-[#050509] text-slate-50 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                        placeholder="הזן שם מלא"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="phone"
                        className="block text-sm font-medium text-slate-300 mb-2 text-right"
                      >
                        טלפון
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        value={bookingFormData.phone}
                        onChange={(e) =>
                          setBookingFormData({
                            ...bookingFormData,
                            phone: e.target.value,
                          })
                        }
                        required
                        className="w-full rounded-lg border border-slate-700 bg-[#050509] text-slate-50 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                        placeholder="הזן מספר טלפון"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="note"
                      className="block text-sm font-medium text-slate-300 mb-2 text-right"
                    >
                      העדפות מיוחדות / הערות
                    </label>
                    <textarea
                      id="note"
                      value={bookingFormData.note}
                      onChange={(e) =>
                        setBookingFormData({
                          ...bookingFormData,
                          note: e.target.value,
                        })
                      }
                      rows={3}
                      className="w-full rounded-lg border border-slate-700 bg-[#050509] text-slate-50 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                      placeholder="השאר הערות או העדפות מיוחדות (אופציונלי)"
                    />
                  </div>

                  {bookingError && (
                    <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-right">
                      <p className="text-sm text-red-400">{bookingError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="bg-amber-400 text-slate-950 rounded-full px-8 py-3 font-semibold hover:bg-amber-500 transition-colors shadow-[0_8px_24px_rgba(250,204,21,0.3)]"
                  >
                    שלח בקשת תור
                  </button>
                </form>
              )}
            </div>
          </section>

          {/* Contact Section */}
          <section id="contact-section" className="lg:grid lg:grid-cols-2 lg:gap-12 items-start">
            {/* Map placeholder - left */}
            <div className="mb-8 lg:mb-0">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-3xl aspect-[4/3] flex flex-col items-center justify-center shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                <p className="text-slate-400 text-sm mb-2">
                  כאן תופיע מפה אינטראקטיבית (Google Maps / Waze)
                </p>
                {config.city && (
                  <p className="text-xs text-amber-400/80">
                    מיקום: {config.city}
                    {config.neighborhood && ` – ${config.neighborhood}`}
                  </p>
                )}
              </div>
            </div>

            {/* Contact methods - right */}
            <div className="space-y-4">
              <div className="text-right space-y-3 mb-6">
                <p className="text-sm uppercase tracking-[0.3em] text-amber-400 font-light">
                  צור קשר
                </p>
                <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide">
                  בואו נפגש
                </h2>
              </div>
              {config.contactOptions.map((option) => {
                const label = contactLabels[option];
                if (!label) return null;
                return (
                  <div
                    key={option}
                    className="bg-[#101018] border border-slate-800 rounded-2xl p-4 flex justify-between items-center hover:border-amber-400/60 transition-colors"
                  >
                    <div className="text-right">
                      <h3 className="font-medium text-amber-400 mb-1">
                        {label.title}
                      </h3>
                      <p className="text-sm text-slate-300">{label.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-black border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-right">
          <p className="text-sm text-slate-400">
            © {currentYear} {config.salonName || "הסלון שלך"} – נבנה בפלטפורמת
            הסלון שלי
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

