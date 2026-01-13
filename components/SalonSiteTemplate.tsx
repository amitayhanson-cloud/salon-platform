"use client";

import type { SiteConfig } from "@/types/siteConfig";
import type { GeneratedContent } from "@/types/generatedContent";

type SalonSiteTemplateProps = {
  config: SiteConfig;
  content: GeneratedContent;
};

export function SalonSiteTemplate({
  config,
  content,
}: SalonSiteTemplateProps) {
  // Get service items from AI content
  const serviceItems = content.services.items.length > 0
    ? content.services.items
    : config.services.map((service) => ({
        name: service,
        description: `שירות מקצועי של ${service}`,
        icon: "✨",
      }));

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

  // Get gallery gradient colors based on salon type
  const getGalleryGradient = (index: number) => {
    const gradients: Record<SiteConfig["salonType"], string[]> = {
      hair: [
        "from-blue-600 to-blue-800",
        "from-blue-500 to-blue-700",
        "from-slate-700 to-blue-900",
      ],
      nails: [
        "from-pink-500 to-rose-600",
        "from-rose-400 to-pink-600",
        "from-purple-400 to-pink-700",
      ],
      barber: [
        "from-slate-700 to-slate-900",
        "from-slate-600 to-blue-800",
        "from-slate-800 to-slate-700",
      ],
      spa: [
        "from-emerald-500 to-teal-600",
        "from-teal-400 to-emerald-600",
        "from-green-500 to-teal-700",
      ],
      mixed: [
        "from-sky-500 to-blue-600",
        "from-blue-400 to-sky-600",
        "from-slate-500 to-blue-700",
      ],
      other: [
        "from-sky-500 to-blue-600",
        "from-blue-400 to-sky-600",
        "from-slate-500 to-blue-700",
      ],
    };
    const salonGradients = gradients[config.salonType];
    return salonGradients[index % salonGradients.length];
  };

  // Contact option labels
  const contactLabels: Record<
    SiteConfig["contactOptions"][number],
    { title: string; buttonText: string }
  > = {
    phone: { title: "טלפון", buttonText: "התקשר עכשיו" },
    whatsapp: { title: "וואטסאפ", buttonText: "שלחו הודעה בוואטסאפ" },
    instagram: { title: "אינסטגרם", buttonText: "עקבו אחרינו" },
    facebook: { title: "פייסבוק", buttonText: "בקרו בעמוד" },
    contact_form: { title: "טופס יצירת קשר", buttonText: "פתחו טופס" },
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-20">
        {/* 1. Hero Section */}
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200 shadow-lg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          {/* Content overlay */}
          <div className="relative z-10 px-6 sm:px-10 lg:px-16 py-16 sm:py-20 lg:py-24">
            <div className="flex flex-col lg:flex-row-reverse gap-8 lg:gap-12 items-center">
              {/* Text content - right side */}
              <div className="flex-1 text-right space-y-4 lg:space-y-6">
                <p className="text-sm sm:text-base tracking-wide text-sky-200 font-medium">
                  {salonTypeLabel}
                </p>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
                  {content.hero.headline}
                </h1>
                <p className="text-base sm:text-lg text-slate-100 leading-relaxed max-w-2xl">
                  {content.hero.subheadline}
                </p>
                {config.city && (
                  <p className="text-sm sm:text-base text-sky-100 font-light">
                    סלון ב־{config.city}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 justify-end pt-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-400 px-6 py-3 sm:px-8 sm:py-3.5 text-sm sm:text-base font-semibold text-white shadow-lg shadow-sky-900/40 transition-colors"
                  >
                    הזמן תור אונליין עכשיו
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
              {/* Image placeholder - left side on desktop */}
              <div className="flex-1 w-full lg:w-auto">
                <div className="rounded-[24px] overflow-hidden bg-slate-700/50 aspect-square max-w-md mx-auto lg:mx-0">
                  <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
                    <span className="text-slate-300 text-sm">תמונת הסלון</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. About Section */}
        <section className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6 sm:p-8 lg:p-12">
          <div className="flex flex-col lg:flex-row-reverse gap-8 lg:gap-12 items-center">
            {/* Text - right side */}
            <div className="flex-1 text-right space-y-5">
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                {content.about.title || `על ${config.salonName}`}
              </h2>
              <p className="text-base sm:text-lg text-slate-700 leading-relaxed">
                {content.about.paragraph}
              </p>
              {content.about.bullets.length > 0 && (
                <div className="flex flex-wrap gap-3 justify-end pt-2">
                  {content.about.bullets.slice(0, 4).map((bullet, i) => (
                    <span
                      key={i}
                      className="inline-block rounded-full bg-sky-50 border border-sky-100 px-4 py-2 text-sm font-medium text-sky-700"
                    >
                      {bullet}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Image placeholder - left side */}
            <div className="flex-1 w-full lg:w-auto">
              <div className="rounded-[32px] overflow-hidden bg-slate-200 aspect-[4/3] shadow-sm max-w-lg mx-auto lg:mx-0">
                <div className="w-full h-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center">
                  <span className="text-slate-500 text-sm">תמונת הסלון</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Services Section */}
        <section className="space-y-6">
          <div className="text-right space-y-2">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              {content.services.title || "השירותים שלנו"}
            </h2>
            <p className="text-base text-slate-600 max-w-2xl">
              {content.services.intro}
            </p>
          </div>

          {serviceItems.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {serviceItems.map((service, idx) => {
                const icon = service.icon ?? "✨";
                // Clean service name - remove any English slugs
                const cleanName = service.name.split(" / ")[0].trim();
                return (
                  <div
                    key={idx}
                    className="rounded-3xl bg-white shadow-sm border border-slate-100 px-6 py-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-end">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-xl">
                        <span>{icon}</span>
                      </div>
                    </div>
                    <div className="text-right space-y-2">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {cleanName}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {service.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-right text-slate-600 text-sm">
              אין שירותים להצגה
            </div>
          )}
        </section>

        {/* 4. Gallery Section */}
        {content.gallery.imagePrompts.length > 0 && (
          <section className="space-y-6">
            <div className="text-right space-y-2">
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                {content.gallery.title || "גלריית תמונות"}
              </h2>
              <p className="text-base text-slate-600 max-w-2xl">
                {content.gallery.description}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 auto-rows-[160px] sm:auto-rows-[200px]">
              {content.gallery.imagePrompts.slice(0, 6).map((prompt, idx) => (
                <div
                  key={idx}
                  className={`relative overflow-hidden rounded-3xl ${
                    idx % 3 === 0 ? "sm:row-span-2" : ""
                  }`}
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${getGalleryGradient(idx)}`}
                  />
                  <div className="absolute inset-0 bg-slate-900/20" />
                  <div className="relative z-10 h-full w-full flex items-end justify-end p-4">
                    <span className="text-xs sm:text-sm text-white bg-slate-900/50 rounded-full px-3 py-1.5 backdrop-blur-sm">
                      {prompt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. Contact Section */}
        <section className="space-y-6">
          <div className="text-right space-y-2">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              {content.contact.title || `צור קשר עם ${config.salonName}`}
            </h2>
            <p className="text-base text-slate-600 max-w-2xl">
              {content.contact.paragraph ||
                "נשמח לשמוע ממך! הזמנת תור בטלפון, בוואטסאפ או דרך האינסטגרם שלך."}
            </p>
          </div>

          <div className="flex flex-col lg:flex-row-reverse gap-8 items-start">
            {/* Contact cards - right side */}
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
                    <button
                      type="button"
                      className={`text-sm font-medium text-right ${
                        option === "whatsapp"
                          ? "text-emerald-600 hover:text-emerald-700"
                          : "text-sky-600 hover:text-sky-700"
                      }`}
                    >
                      {label.buttonText}
                    </button>
                  </div>
                );
              })}
              {/* Location card */}
              {config.city && (
                <div className="rounded-2xl bg-white border border-slate-200 px-6 py-5 shadow-sm">
                  <h3 className="font-semibold mb-2 text-right text-slate-900">
                    מיקום
                  </h3>
                  <p className="text-sm text-slate-600 text-right">
                    {config.city}
                    {config.neighborhood && ` – שכונת ${config.neighborhood}`}
                  </p>
                </div>
              )}
            </div>

            {/* Map placeholder - left side */}
            <div className="flex-1 w-full lg:w-auto">
              <div className="rounded-[32px] overflow-hidden bg-slate-200 h-64 lg:h-80 shadow-sm">
                <div className="w-full h-full flex items-center justify-center text-sm text-slate-600 bg-gradient-to-br from-slate-300 to-slate-400">
                  <p className="text-center px-4">
                    כאן תופיע מפה אינטראקטיבית (Google Maps / Waze)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

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
