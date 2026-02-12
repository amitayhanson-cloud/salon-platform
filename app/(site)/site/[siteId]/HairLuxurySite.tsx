"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
// Removed useRouter and useAuth - public site has no admin access
import type { SiteConfig } from "@/types/siteConfig";
import type { TemplateDefinition } from "@/lib/templateLibrary";
import { bookingEnabled } from "@/lib/bookingEnabled";
import type { SiteService } from "@/types/siteConfig";
import {
  HAIR_HERO_IMAGES,
  HAIR_ABOUT_IMAGES,
  HAIR_WORK_IMAGES,
} from "@/lib/hairImages";
import { defaultThemeColors } from "@/types/siteConfig";
import {
  slideInFromLeft,
  slideInFromRight,
  servicesContainer,
  serviceItem,
  servicesTitle,
} from "@/lib/animations";
import { getSiteUrl } from "@/lib/tenant";
import WaveDivider from "./components/WaveDivider";
import ContactIconsBar from "./components/ContactIconsBar";
import SalonHeader from "./components/SalonHeader";
import ServiceCard from "./components/ServiceCard";
import { TestimonialCarousel, type TestimonialItem } from "@/components/ui/testimonial-carousel";

// Work Gallery Component with horizontal scrolling
function WorkGallery({ images }: { images: string[] }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Handle drag to scroll
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    scrollContainerRef.current.style.cursor = "grabbing";
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = "grab";
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = "grab";
    }
  };

  // Scroll by one card width
  // scrollBy handles RTL automatically - browser inverts direction as needed
  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const cardWidth = container.querySelector(".gallery-card")?.clientWidth || 0;
    const gap = 16; // gap-4 = 1rem = 16px
    const scrollAmount = cardWidth + gap;
    
    if (direction === "left") {
      container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    } else {
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      {/* Left Arrow Button (desktop only, always visible) */}
      <button
        onClick={() => scroll("left")}
        className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center rounded-full shadow-lg opacity-100 transition-opacity"
        style={{ backgroundColor: "var(--surface)", color: "var(--text)" }}
        aria-label="גלול שמאלה"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {/* Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide cursor-grab active:cursor-grabbing"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {images.map((src, index) => (
          <div
            key={src + index}
            className="gallery-card flex-shrink-0 snap-start w-[80%] sm:w-[45%] lg:w-[32%]"
          >
            <div className="relative overflow-hidden rounded-2xl shadow-sm aspect-[4/3]" style={{ backgroundColor: "var(--border)" }}>
              <Image
                src={src}
                alt={`תמונה מהסלון ${index + 1}`}
                fill
                className="object-cover transition-transform duration-500 hover:scale-105"
                sizes="(max-width: 640px) 80vw, (max-width: 1024px) 45vw, 32vw"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Right Arrow Button (desktop only, always visible) */}
      <button
        onClick={() => scroll("right")}
        className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center rounded-full shadow-lg opacity-100 transition-opacity"
        style={{ backgroundColor: "var(--surface)", color: "var(--text)" }}
        aria-label="גלול ימינה"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  );
}

export default function HairLuxurySite({
  config,
  template,
  siteId,
  services,
}: {
  config: SiteConfig;
  template: TemplateDefinition;
  siteId: string;
  services: SiteService[];
}) {
  // Public site - no admin access, no auth needed

  const { colors, images } = template.assets;

  // Use config images if set, otherwise use defaults
  const heroImageUrl = config.heroImage || HAIR_HERO_IMAGES[0];
  const aboutImageUrl = config.aboutImage || HAIR_ABOUT_IMAGES[0];
  const galleryImages = HAIR_WORK_IMAGES;

  // Get theme colors with defaults
  const theme = config.themeColors || defaultThemeColors;

  // Scroll functions
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Use services from services array (same source as admin Services page)
  // ONLY use services from Firestore - no fallback to config.services or defaults
  // Filter to only enabled services with valid names
  const visibleServices = services
    .filter((s) => s && s.enabled !== false && s.name && s.name.trim())
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name || "").localeCompare(b.name || ""));

  const hasServices = visibleServices.length > 0;

  // Build address string for map and Waze
  const buildAddressString = (): string | null => {
    if (config.address && config.address.trim()) {
      return config.address.trim();
    }
    // Fallback: use city + neighborhood
    const cityPart = config.city?.trim() || "";
    const neighborhoodPart = config.neighborhood?.trim() || "";
    const combined = `${cityPart} ${neighborhoodPart}`.trim();
    return combined || null;
  };

  const currentYear = new Date().getFullYear();

  return (
    <div
      dir="rtl"
      className="min-h-screen text-right"
      style={{
        "--bg": theme.background,
        "--surface": theme.surface,
        "--text": theme.text,
        "--muted": theme.mutedText,
        "--primary": theme.primary,
        "--primaryText": theme.primaryText,
        "--accent": theme.accent,
        "--border": theme.border,
        "--heroBase": "#000000", // Dark base for hero overlay
        // Additional variables for testimonial carousel
        "--card": theme.surface,
        "--fg": theme.text,
        "--muted-foreground": theme.mutedText,
        background: `radial-gradient(circle at top, var(--surface) 0, var(--bg) 55%, #000000 100%)`,
      } as React.CSSProperties}
    >
      {/* Salon header: RTL, name on right, nav + CTA on left */}
      <SalonHeader
        salonName={config.salonName || "שם הסלון"}
        siteId={siteId}
        slug={config.slug ?? null}
        bookingEnabled={bookingEnabled(config)}
        scrollToSection={scrollToSection}
        logoUrl={config.branding?.logoUrl ?? null}
        logoAlt={config.branding?.logoAlt}
      />

      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center px-4">
        <div className="absolute inset-0">
          <img
            src={heroImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/75 to-black/90" />

        <motion.div
          className="relative z-10 w-full max-w-4xl mx-auto text-center text-white space-y-6"
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: 0.14, delayChildren: 0.1 },
            },
            hidden: {},
          }}
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
              },
            }}
          >
            <p className="text-sm tracking-[0.2em]" style={{ color: "var(--primaryText)", opacity: 0.9 }}>
              סלון יופי | עיצוב שיער
            </p>
            <div className="space-y-2">
              <p
                dir="ltr"
                lang="en"
                className="text-2xl sm:text-3xl font-medium tracking-wide text-white/95"
                style={{ unicodeBidi: "isolate" }}
              >
                {config.salonName || "שם הסלון"}
              </p>
              <h1
                dir="rtl"
                lang="he"
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight"
                style={{ unicodeBidi: "plaintext" }}
              >
                חוויית שיער ברמת לוקס
              </h1>
            </div>
          </motion.div>

          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto"
            style={{ color: "var(--primaryText)", opacity: 0.9 }}
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
              },
            }}
          >
            צוות מקצועי, חומרים פרימיום ואווירה פרטית ומפנקת – לכל לקוחה שמחפשת
            טיפול שיער מדויק ברמה הגבוהה ביותר.
          </motion.p>

          <motion.div
            className="flex flex-wrap justify-center gap-4 pt-4"
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
              },
            }}
          >
            {bookingEnabled(config) && (
              <Link
                href={getSiteUrl(config?.slug, siteId, "/book")}
                className="px-8 py-3 rounded-full font-semibold shadow-lg transition hover:opacity-90"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primaryText)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
                }}
              >
                קבעי תור אונליין
              </Link>
            )}
            <button
              onClick={() => scrollToSection("contact-section")}
              className="px-8 py-3 rounded-full font-semibold border transition hover:opacity-90"
              style={{
                borderColor: "rgba(255, 255, 255, 0.3)",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "var(--primaryText)",
              }}
            >
              צור קשר
            </button>
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-8 h-12 rounded-full border border-white/50 flex items-start justify-center p-1">
            <div className="w-1.5 h-3 rounded-full bg-white/80 animate-bounce" />
          </div>
        </div>
      </section>

      <WaveDivider
        topColor="var(--heroBase)"
        bottomColor="var(--bg)"
        heightClassName="h-[clamp(64px,9vw,120px)]"
      />

      {/* About Section */}
      <section
        id="about-section"
        className="py-16 lg:py-24"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Text side (RTL, on the right on large screens) — slides in from right */}
            <motion.div className="order-2 lg:order-1 text-right" {...slideInFromRight}>
              <p
                className="text-sm uppercase tracking-[0.3em] font-light mb-2"
                style={{ color: "var(--accent)" }}
              >
                על הסלון
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "var(--text)" }}>
                {config.salonName ? `על ${config.salonName}` : "על הסלון"}
              </h2>
              <div className="space-y-3 leading-relaxed" style={{ color: "var(--muted)" }}>
                <p className="text-sm">
                  {config.salonName || "הסלון"} הוא סלון שיער בוטיק המתמחה בתספורות
                  מדויקות, צבעי שיער מתקדמים וטיפולי פרימיום לשיקום וחיזוק השיער.
                </p>
                <p className="text-sm">
                  צוות מקצועי, אווירה אינטימית ושימת לב לכל פרט קטן – כדי שכל
                  לקוחה תצא עם תחושת לוקס אמיתית.
                </p>
                {config.city && (
                  <p className="text-sm font-medium mt-2" style={{ color: "var(--text)" }}>
                    ממוקם ב{config.city} והסביבה.
                  </p>
                )}
                {config.specialNote && (
                  <p style={{ color: "var(--accent)" }} className="text-sm italic">
                    {config.specialNote}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="rounded-full px-4 py-2 text-xs text-center shadow-sm" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
                  +15 שנות ניסיון
                </div>
                <div className="rounded-full px-4 py-2 text-xs text-center shadow-sm" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
                  אווירה פרטית ומוקפדת
                </div>
                <div className="rounded-full px-4 py-2 text-xs text-center shadow-sm" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
                  חומרים פרימיום בלבד
                </div>
              </div>
            </motion.div>

            {/* Image side (RTL, on the left on large screens) — slides in from left */}
            <motion.div className="order-1 lg:order-2" {...slideInFromLeft}>
              <div className="relative overflow-hidden rounded-3xl shadow-lg" style={{ backgroundColor: "var(--border)" }}>
                <img
                  src={aboutImageUrl}
                  alt="תמונה מתוך הסלון"
                  className="w-full h-80 object-cover"
                />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/10 via-transparent to-white/5" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Services Section - Only render if services exist */}
      {hasServices && (
      <section
        id="services-section"
        dir="rtl"
        className="py-16 lg:py-24"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8 space-y-10">
          <motion.div
            className="text-right space-y-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={servicesTitle}
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
              השירותים שלנו
            </h2>
            <p className="text-base max-w-2xl" style={{ color: "var(--muted)" }}>
              כל שירות מבוצע בקפידה על ידי צוות מקצועי ומנוסה, תוך שימוש בחומרים איכותיים וטכניקות מתקדמות.
            </p>
          </motion.div>

          <motion.div
            className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={servicesContainer}
          >
            {visibleServices.map((service, idx) => (
              <motion.div key={service.id} variants={serviceItem}>
                <ServiceCard
                  service={service}
                  siteId={siteId}
                  slug={config.slug ?? null}
                  bookingEnabled={bookingEnabled(config)}
                  libraryImage={HAIR_WORK_IMAGES[idx % HAIR_WORK_IMAGES.length]}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
      )}

      {/* Gallery Section - same background as Services, no divider needed */}
      <section
        id="gallery-section"
        className="py-16 lg:py-24"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="mb-8 text-right">
            <h2
              className="text-2xl sm:text-3xl font-bold"
              style={{ color: "var(--text)" }}
            >
              גלריית עבודות
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--muted)" }}
            >
              מבחר קטן מהעבודות והאווירה בסלון.
            </p>
          </div>

          <WorkGallery images={galleryImages} />
        </div>
      </section>

      {/* Reviews Section */}
      {(() => {
        const reviews = Array.isArray(config.reviews) ? config.reviews : [];
        
        // Map reviews to testimonials format
        const testimonials: TestimonialItem[] = reviews
          .map((review, idx) => ({
            id: review.id ?? idx,
            name: (review.name && String(review.name).trim()) ? String(review.name).trim() : "לקוחה",
            description: (review.text && String(review.text).trim()) ? String(review.text).trim() : "",
            rating: Math.max(1, Math.min(5, Number(review.rating) || 5)),
            avatar: review.avatarUrl || null,
          }))
          .filter((t) => t.description.length > 0);

        if (testimonials.length > 0) {
          return (
            <section
              id="reviews-section"
              className="py-16 lg:py-24"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <div className="max-w-6xl mx-auto px-4 lg:px-8 space-y-8">
                <div className="text-right space-y-3">
                  <p
                    className="text-sm uppercase tracking-[0.3em] font-light"
                    style={{ color: "var(--accent)" }}
                  >
                    מה הלקוחות אומרים
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide pb-2 mb-6 border-b" style={{ color: "var(--text)", borderColor: "var(--accent)" }}>
                    המלצות מלקוחות מרוצים
                  </h2>
                </div>

                <TestimonialCarousel
                  testimonials={testimonials}
                  className="mt-8"
                />
              </div>
            </section>
          );
        }
        return null;
      })()}

      {/* FAQ Section */}
      {(config.faqs?.length ?? 0) > 0 && (
        <>
          <section
            id="faq-section"
            className="py-16 lg:py-24"
            style={{ backgroundColor: "var(--surface)" }}
          >
          <div className="max-w-4xl mx-auto px-4 lg:px-8 space-y-8">
            <div className="text-right space-y-3">
              <p
                className="text-sm uppercase tracking-[0.3em] font-light"
                style={{ color: "var(--accent)" }}
              >
                שאלות נפוצות
              </p>
              <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-wide" style={{ color: "var(--text)" }}>
                כל מה שרציתם לדעת
              </h2>
            </div>

            <div className="space-y-4">
              {config.faqs?.map((faq) => (
                <details
                  key={faq.id}
                  className="rounded-2xl shadow-md overflow-hidden transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
                >
                  <summary className="p-6 cursor-pointer text-right font-semibold transition-colors hover:opacity-80" style={{ color: "var(--text)" }}>
                    {faq.question}
                  </summary>
                  <div className="px-6 pb-6 pt-0 text-right leading-relaxed" style={{ color: "var(--muted)" }}>
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
        </>
      )}

      {/* Contact Section */}
      <section id="contact-section" className="py-16 lg:py-24" style={{ backgroundColor: "var(--bg)" }}>
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          {/* Map block - top */}
          {buildAddressString() ? (
            <div className="pb-6">
              <div className="w-full overflow-hidden rounded-2xl border shadow-md" style={{ borderColor: "var(--border)" }}>
                <iframe
                  title="Map"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(buildAddressString()!)}&output=embed`}
                  width="100%"
                  height="360"
                  loading="lazy"
                  className="w-full"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0 }}
                />
              </div>
            </div>
          ) : (
            <div className="pb-6">
              <div className="rounded-3xl aspect-[4/3] flex flex-col items-center justify-center shadow-md" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}>
                <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
                  כאן תופיע מפה אינטראקטיבית (Google Maps / Waze)
                </p>
                {config.city && (
                  <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
                    מיקום: {config.city}
                    {config.neighborhood && ` – ${config.neighborhood}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Contact Icons Bar - below map */}
          <div className="pt-4">
            <ContactIconsBar
              phoneNumber={config.phoneNumber}
              whatsappNumber={config.whatsappNumber}
              instagramHandle={config.instagramHandle}
              facebookPage={config.facebookPage}
              contactEmail={config.contactEmail}
              address={buildAddressString()}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 border-t"
        style={{
          backgroundColor: "var(--bg)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-right">
          <p style={{ color: "var(--muted)" }} className="text-sm">
            © {currentYear} {config.salonName || "הסלון שלך"} – נבנה ב-Caleno
          </p>
        </div>
      </footer>

      {/* Floating WhatsApp button */}
      {config.whatsappNumber && (
        <a
          href={`https://wa.me/${config.whatsappNumber.replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-30 rounded-full shadow-xl w-14 h-14 flex items-center justify-center text-2xl text-white transition-colors bg-[#25D366] hover:bg-[#1EBE5A]"
          aria-label="פתח וואטסאפ"
        >
          ⟳
        </a>
      )}
    </div>
  );
}

