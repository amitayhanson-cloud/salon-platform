"use client";

import type { SiteConfig } from "@/types/siteConfig";
import type { GeneratedContent } from "@/types/generatedContent";

type SalonSitePreviewProps = {
  config: SiteConfig;
  content: GeneratedContent;
};

export function SalonSitePreview({ config, content }: SalonSitePreviewProps) {
  // Merge config.services with content.services.items
  const allServices = content.services.items.length > 0
    ? content.services.items
    : config.services.map((service) => ({
        name: service,
        description: `שירות מקצועי של ${service}`,
      }));

  return (
    <div dir="rtl" className="w-full bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Hero Section */}
        <section className="flex flex-col md:flex-row gap-8 items-center">
          <div className="flex-1 text-right">
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-4">
              {content.hero.headline}
            </h2>
            <p className="text-slate-700 text-sm sm:text-base mb-6">
              {content.hero.subheadline}
            </p>
            <button className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium transition-colors">
              {content.hero.primaryCtaLabel}
            </button>
          </div>
          <div className="flex-1 w-full md:w-auto">
            <div className="aspect-square bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center">
              <span className="text-xs text-slate-400 text-center px-2">
                תמונת הסלון
              </span>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 text-right mb-4">
            {content.about.title}
          </h2>
          <p className="text-slate-700 text-right text-sm sm:text-base mb-4">
            {content.about.paragraph}
          </p>
          {content.about.bullets.length > 0 && (
            <ul className="space-y-2 text-slate-700 text-right text-sm sm:text-base">
              {content.about.bullets.map((bullet, index) => (
                <li key={index} className="flex items-start gap-2 justify-end">
                  <span className="text-sky-500">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Services Section */}
        <section id="services">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 text-right mb-4">
            {content.services.title}
          </h2>
          <p className="text-slate-700 text-right text-sm sm:text-base mb-6">
            {content.services.intro}
          </p>
          {allServices.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {allServices.map((service, index) => (
                <div
                  key={index}
                  className="bg-slate-50 rounded-lg p-4 border border-slate-200"
                >
                  <h3 className="text-lg font-semibold text-slate-900 mb-2 text-right">
                    {service.name}
                  </h3>
                  <p className="text-slate-600 text-sm text-right">
                    {service.description}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2 text-slate-700 text-right text-sm sm:text-base">
              {config.services.map((service, index) => (
                <li key={index} className="flex items-start gap-2 justify-end">
                  <span className="text-sky-500">•</span>
                  <span>{service}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Gallery Section */}
        {content.gallery.imagePrompts.length > 0 && (
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 text-right mb-4">
              {content.gallery.title}
            </h2>
            <p className="text-slate-700 text-right text-sm sm:text-base mb-6">
              {content.gallery.description}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {content.gallery.imagePrompts.slice(0, 6).map((prompt, index) => (
                <div
                  key={index}
                  className="aspect-square bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center"
                >
                  <span className="text-xs text-slate-400 text-center px-2">
                    {prompt}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reviews Section */}
        {content.reviews.items.length > 0 && (
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 text-right mb-4">
              {content.reviews.title}
            </h2>
            <div className="space-y-4">
              {content.reviews.items.map((review, index) => (
                <div
                  key={index}
                  className="bg-slate-50 rounded-lg p-4 border border-slate-200"
                >
                  <p className="text-slate-700 text-right text-sm sm:text-base">
                    {review}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contact / Booking Section */}
        <section id="contact">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 text-right mb-4">
            {content.contact.title}
          </h2>
          <p className="text-slate-700 text-right text-sm sm:text-base mb-6">
            {content.contact.paragraph}
          </p>
          <div className="flex flex-wrap gap-3 justify-end">
            {config.contactOptions.includes("phone") && (
              <button className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium transition-colors text-sm">
                התקשר עכשיו
              </button>
            )}
            {config.contactOptions.includes("whatsapp") && (
              <button className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium transition-colors text-sm">
                שלחו הודעה בוואטסאפ
              </button>
            )}
            {config.contactOptions.includes("instagram") && (
              <button className="px-4 py-2 border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-lg font-medium transition-colors text-sm">
                אינסטגרם
              </button>
            )}
            {config.contactOptions.includes("facebook") && (
              <button className="px-4 py-2 border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-lg font-medium transition-colors text-sm">
                פייסבוק
              </button>
            )}
            {config.contactOptions.includes("contact_form") && (
              <button className="px-4 py-2 border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-lg font-medium transition-colors text-sm">
                טופס יצירת קשר
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

