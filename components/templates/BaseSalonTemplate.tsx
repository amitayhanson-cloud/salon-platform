"use client";

import { useState, useEffect } from "react";
import type { SiteConfig } from "@/types/siteConfig";

type BaseSalonTemplateProps = {
  config: SiteConfig;
};

export function BaseSalonTemplate({ config }: BaseSalonTemplateProps) {
  // Booking state
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

  const scrollToBooking = () => {
    const element = document.getElementById("booking-section");
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
      selectedService: config.services.length > 0 
        ? selectedService 
        : "שירות כללי בסלון",
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

  const currentYear = new Date().getFullYear();

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-20">
        {/* 1. Hero Section */}
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200 shadow-lg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="relative z-10 px-6 sm:px-10 lg:px-16 py-16 sm:py-20 lg:py-24">
            <div className="max-w-2xl text-right space-y-6">
              <p className="text-sm sm:text-base tracking-wide text-sky-200 font-medium">
                {salonTypeLabel} מעוצב
              </p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
                {config.salonName || "הסלון שלך"}
              </h1>
              <p className="text-base sm:text-lg text-slate-100 leading-relaxed">
                סלון מקצועי המציע שירותים איכותיים באווירה נעימה ומזמינה. אנו
                מחויבים לספק חוויה ייחודית ומשביעת רצון לכל לקוח.
              </p>
              {config.mainGoals.includes("online_booking") && (
                <p className="text-sm sm:text-base text-sky-100">
                  הזמנת תור אונליין זמינה 24/7
                </p>
              )}
              <div className="flex flex-wrap gap-3 justify-end pt-2">
                <button
                  onClick={scrollToBooking}
                  className="inline-flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-400 px-6 py-3 sm:px-8 sm:py-3.5 text-sm sm:text-base font-semibold text-white shadow-lg shadow-sky-900/40 transition-colors"
                >
                  קבעו תור אונליין
                </button>
                {config.contactOptions.includes("whatsapp") && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full bg-white/95 hover:bg-white px-6 py-3 sm:px-8 sm:py-3.5 text-sm sm:text-base font-semibold text-emerald-700 shadow-lg transition-colors"
                  >
                    שלחו לנו בוואטסאפ
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 2. About Section */}
        <section className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6 sm:p-8 lg:p-12">
          <div className="text-right space-y-5">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              {config.salonName ? `על ${config.salonName}` : "על הסלון"}
            </h2>
            <p className="text-base sm:text-lg text-slate-700 leading-relaxed">
              {salonTypeLabel} מודרני המתמחה במתן שירותים מקצועיים ואיכותיים. אנו
              מציעים חוויה ייחודית המשלבת מקצועיות, איכות ואווירה נעימה.
            </p>
            <div className="flex flex-wrap gap-3 justify-end pt-2">
              {[
                "צוות מקצועי",
                "אווירה אישית",
                "חומרים איכותיים",
                "תוצאות ברמה גבוהה",
              ].map((pill, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full bg-sky-50 border border-sky-100 px-4 py-2 text-sm font-medium text-sky-700"
                >
                  {pill}
                </span>
              ))}
            </div>
            {config.specialNote && (
              <div className="mt-6 p-4 bg-sky-50 border border-sky-200 rounded-lg">
                <p className="text-sm text-slate-700">{config.specialNote}</p>
              </div>
            )}
          </div>
        </section>

        {/* 3. Services Section */}
        <section className="space-y-6">
          <div className="text-right space-y-2">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              השירותים שלנו
            </h2>
            <p className="text-base text-slate-600 max-w-2xl">
              אנו מציעים מגוון רחב של שירותים מקצועיים המותאמים לצרכים שלכם.
            </p>
          </div>

          {config.services.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {config.services.map((service, idx) => (
                <div
                  key={idx}
                  className="rounded-3xl bg-white shadow-sm border border-slate-100 px-6 py-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-end">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-xl">
                      <span>✨</span>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {service}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      שירות מקצועי המותאם לצרכים שלך ומבוצע על ידי צוות מיומן
                      ומנוסה.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-right text-slate-600 text-sm">
              אין שירותים להצגה
            </div>
          )}
        </section>

        {/* 4. Gallery Section */}
        <section className="space-y-6">
          <div className="text-right space-y-2">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              גלריית עבודות
            </h2>
            <p className="text-base text-slate-600 max-w-2xl">
              צפו בעבודות שלנו ותוצאות מרשימות מלקוחות מרוצים.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 auto-rows-[160px] sm:auto-rows-[200px]">
            {Array.from({ length: Math.min(6, Math.max(3, config.services.length || 3)) }).map(
              (_, idx) => {
                const serviceName =
                  (config.services[idx] 
                    ? config.services[idx]
                    : "שירות מקצועי");
                return (
                  <div
                    key={idx}
                    className={`relative overflow-hidden rounded-3xl ${
                      idx % 3 === 0 ? "sm:row-span-2" : ""
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-blue-600" />
                    <div className="absolute inset-0 bg-slate-900/20" />
                    <div className="relative z-10 h-full w-full flex items-end justify-end p-4">
                      <span className="text-xs sm:text-sm text-white bg-slate-900/50 rounded-full px-3 py-1.5 backdrop-blur-sm">
                        {idx < config.services.length
                          ? `תוצאה אחרי ${serviceName}`
                          : "תמונת עבודה לדוגמה"}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </section>

        {/* 5. Booking Section */}
        <section id="booking-section" className="space-y-6">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="text-right space-y-2 mb-8">
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                קביעת תור אונליין
              </h2>
              <p className="text-base text-slate-600 max-w-2xl">
                בחרו שירות, יום ושעה מתאימה והשאירו פרטים. נחזור אליכם לאישור.
              </p>
            </div>

            {bookingSubmitted ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-right">
                <p className="text-sm text-green-700">
                  הבקשה נשלחה. נחזור אליך לאישור התור.
                </p>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-6">
                {/* Service Selection */}
                <div>
                  <label
                    htmlFor="service"
                    className="block text-sm font-medium text-slate-700 mb-2 text-right"
                  >
                    בחר שירות
                  </label>
                  {config.services.length > 0 ? (
                    <select
                      id="service"
                      value={selectedService}
                      onChange={(e) => setSelectedService(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                    <div className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right bg-slate-50 text-slate-500">
                      שירות כללי בסלון
                    </div>
                  )}
                </div>

                {/* Calendar - Next 7 Days */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3 text-right">
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
                              ? "bg-sky-500 text-white border-sky-500"
                              : "bg-white text-slate-700 border-slate-300 hover:border-sky-300"
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
                    <label className="block text-sm font-medium text-slate-700 mb-3 text-right">
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
                            className={`px-4 py-2 rounded-lg border-2 transition-colors text-sm font-medium ${
                              isSelected
                                ? "bg-sky-500 text-white border-sky-500"
                                : "bg-white text-slate-700 border-slate-300 hover:border-sky-300"
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
                      className="block text-sm font-medium text-slate-700 mb-2 text-right"
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
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="הזן שם מלא"
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
                      value={bookingFormData.phone}
                      onChange={(e) =>
                        setBookingFormData({
                          ...bookingFormData,
                          phone: e.target.value,
                        })
                      }
                      required
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="הזן מספר טלפון"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="note"
                    className="block text-sm font-medium text-slate-700 mb-2 text-right"
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
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="השאר הערות או העדפות מיוחדות (אופציונלי)"
                  />
                </div>

                {bookingError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                    <p className="text-sm text-red-700">{bookingError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors"
                >
                  שלח בקשת תור
                </button>
              </form>
            )}
          </div>
        </section>

        {/* 6. Contact Section */}
        <section id="contact-section" className="space-y-6">
          <div className="text-right space-y-2">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              צור קשר
            </h2>
            <p className="text-base text-slate-600 max-w-2xl">
              נשמח לשמוע ממך! ניתן ליצור קשר בטלפון, בוואטסאפ או להשאיר פרטים
              ונחזור אליך בהקדם.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row-reverse gap-8 items-start">
            {/* Contact methods - right side */}
            <div className="flex-1 space-y-4 w-full">
              {config.contactOptions.map((option) => {
                const label = contactLabels[option];
                if (!label) return null;
                return (
                  <div
                    key={option}
                    className="rounded-2xl bg-white border border-slate-200 px-6 py-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <h3 className="font-semibold mb-2 text-right text-slate-900">
                      {label.title}
                    </h3>
                    <p className="text-sm text-slate-600 text-right">
                      {label.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Map placeholder - left side */}
            <div className="flex-1 w-full lg:w-auto">
              <div className="rounded-[32px] overflow-hidden bg-slate-200 h-64 lg:h-80 shadow-sm">
                <div className="w-full h-full flex flex-col items-center justify-center text-sm text-slate-600 bg-gradient-to-br from-slate-300 to-slate-400 p-4">
                  <p className="text-center mb-2">
                    כאן תופיע מפה (Google Maps / Waze)
                  </p>
                  {config.city && (
                    <p className="text-center text-xs font-medium">
                      מיקום: {config.city}
                      {config.neighborhood && `, ${config.neighborhood}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-right">
          <p className="text-sm text-slate-600">
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
