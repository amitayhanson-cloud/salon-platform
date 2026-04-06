"use client";

/**
 * Velvet & Vogue – flattened public landing (single file).
 * Scoped CSS variables + utilities under `.vogue-nails-root` (same pattern as BarberTemplate).
 */

import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle,
  Clock,
  Facebook,
  Flower2,
  Gem,
  Instagram,
  Mail,
  MapPin,
  Menu,
  Paintbrush,
  Phone,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { db } from "@/lib/firebaseClient";
import { subscribeBookingSettings } from "@/lib/firestoreBookingSettings";
import {
  bookingSettingsToHebrewDayRows,
  defaultHebrewOpeningRows,
} from "@/lib/bookingSettingsDisplay";
import { getSiteUrl } from "@/lib/tenant";
import { getGalleryImages } from "@/lib/getGalleryImages";
import { vogueNailsCssVarsFromConfig } from "@/lib/scopedSkinCssVars";

const HERO_FALLBACK =
  "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1920&q=80";
const ABOUT_FALLBACK =
  "https://images.unsplash.com/photo-1519014816548-bf6898331664?w=800&q=80";

const GALLERY_FALLBACK = [
  "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80",
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
  "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80",
  "https://images.unsplash.com/photo-1610992015732-0ca40f57e4d6?w=800&q=80",
  "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=80",
  "https://images.unsplash.com/photo-1604902396830-74f2d8b0a5f1?w=800&q=80",
] as const;

const SERVICE_ICONS = [Gem, Flower2, Paintbrush, Sparkles] as const;

/** Scoped theme (Lovable index.css), isolated from the rest of Caleno. */
const VOGUE_NAILS_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap');

.vogue-nails-root {
  direction: rtl;
  --background: 55 80% 96%;
  --foreground: 350 10% 20%;
  --card: 0 20% 95%;
  --card-foreground: 350 10% 20%;
  --primary: 350 33% 58%;
  --primary-foreground: 55 80% 96%;
  --secondary: 210 30% 69%;
  --secondary-foreground: 210 30% 15%;
  --muted: 0 15% 90%;
  --muted-foreground: 350 8% 45%;
  --accent: 0 27% 83%;
  --accent-foreground: 350 10% 20%;
  --border: 0 15% 88%;
  --input: 0 15% 88%;
  --ring: 350 33% 58%;
  --radius: 0.75rem;
  font-family: 'Inter', system-ui, sans-serif;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  scroll-behavior: smooth;
}

.vogue-nails-root h1,
.vogue-nails-root h2,
.vogue-nails-root h3,
.vogue-nails-root h4,
.vogue-nails-root h5,
.vogue-nails-root h6,
.vogue-nails-root .vvn-font-serif {
  font-family: 'Playfair Display', Georgia, serif;
}

.vogue-nails-root .vvn-glass {
  background-color: hsl(var(--background) / 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid hsl(var(--border) / 0.5);
}

.vogue-nails-root .vvn-section-padding {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-top: 5rem;
  padding-bottom: 5rem;
}
@media (min-width: 768px) {
  .vogue-nails-root .vvn-section-padding {
    padding-left: 3rem;
    padding-right: 3rem;
    padding-top: 7rem;
    padding-bottom: 7rem;
  }
}

.vogue-nails-root .vvn-fade-in {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.7s ease-out, transform 0.7s ease-out;
}
.vogue-nails-root .vvn-fade-in.vvn-fade-in-visible {
  opacity: 1;
  transform: translateY(0);
}

.vogue-nails-root .vvn-faq-details {
  border-radius: 0.75rem;
  border: 1px solid hsl(var(--border) / 0.6);
  background: hsl(var(--background));
  overflow: hidden;
}
.vogue-nails-root .vvn-faq-summary {
  cursor: pointer;
  list-style: none;
  padding: 1.1rem 1.25rem;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1rem;
  color: hsl(var(--foreground));
}
.vogue-nails-root .vvn-faq-summary::-webkit-details-marker { display: none; }
.vogue-nails-root .vvn-faq-body {
  padding: 0 1.25rem 1.1rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
}
`;

function useScrollFadeIn(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function formatServicePrice(s: SiteService): string {
  if (s.price === undefined || s.price === null || s.price === "") return "—";
  if (typeof s.price === "number") return `₪${s.price}`;
  const t = String(s.price).trim();
  return t || "—";
}

function formatDurationMinutes(min: number | undefined): string {
  if (min === undefined || min === null || Number.isNaN(min)) return "";
  return `${min} דק׳`;
}

function buildAddressString(config: SiteConfig): string | null {
  if (config.address?.trim()) return config.address.trim();
  const city = config.city?.trim() || "";
  const neighborhood = config.neighborhood?.trim() || "";
  const combined = `${city} ${neighborhood}`.trim();
  return combined || null;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export type VogueNailsShellProps = {
  siteId: string;
  config: SiteConfig;
  services: SiteService[];
  /** Hide fixed nav header (e.g. builder live preview). */
  hideHeader?: boolean;
};

export function VogueNailsShell({
  siteId,
  config,
  services,
  hideHeader = false,
}: VogueNailsShellProps) {
  const brandName = config.salonName?.trim() || "הסטודיו שלכם";
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hourRows, setHourRows] = useState(defaultHebrewOpeningRows);

  const fadeAbout = useScrollFadeIn();
  const fadeServices = useScrollFadeIn();
  const fadeBooking = useScrollFadeIn();
  const fadeGallery = useScrollFadeIn();
  const fadeReviews = useScrollFadeIn();
  const fadeFaq = useScrollFadeIn();
  const fadeContact = useScrollFadeIn();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!siteId || !db) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeBookingSettings(
        siteId,
        (s) => setHourRows(bookingSettingsToHebrewDayRows(s)),
        () => setHourRows(defaultHebrewOpeningRows())
      );
    } catch {
      setHourRows(defaultHebrewOpeningRows());
    }
    return () => unsub?.();
  }, [siteId]);

  const scrollTo = (href: string) => {
    setMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  const bookHref = getSiteUrl(config.slug ?? null, siteId, "/book");
  const addressLine = buildAddressString(config);
  const mapEmbed =
    addressLine != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(addressLine)}&output=embed`
      : null;

  const heroImage = config.heroImage?.trim() || HERO_FALLBACK;
  const aboutImage = config.aboutImage?.trim() || ABOUT_FALLBACK;
  const galleryImages = getGalleryImages(config, [...GALLERY_FALLBACK]);

  const heroTagline =
    config.content?.hero?.tagline?.trim() || "סטודיו לציפורניים";
  const heroTitle =
    config.content?.hero?.title?.trim() || brandName;
  const heroSubtitle =
    config.content?.hero?.subtitle?.trim() ||
    "מניקור, פדיקור ועיצוב ציפורניים — בדיוק כפי שתרצו, עם חומרים איכותיים ותשומת לב לפרטים.";

  const aboutHeading =
    config.content?.about?.headingTitle?.trim() || "החוויה שלנו";
  const aboutBody =
    config.content?.about?.body?.trim() ||
    config.specialNote?.trim() ||
    "אצלנו טיפוח הציפורניים הוא רגע של שקט ויופי. נשמח לארח אתכם בסטודיו נקי, מסודר ומוקפד — והכול ניתן לעדכון מלאה מלוח הבקרה.";

  const reviews = config.reviews?.filter((r) => r.text?.trim()) ?? [];
  const faqs = config.faqs?.filter((f) => f.question?.trim() && f.answer?.trim()) ?? [];

  const displayServices = services.filter((s) => s.enabled !== false);
  const phoneDisplay = config.phoneNumber?.trim();
  const wa = config.whatsappNumber?.trim();
  const waDigits = wa ? digitsOnly(wa) : "";
  const waHref = waDigits ? `https://wa.me/${waDigits}` : null;
  const ig = config.instagramHandle?.trim();
  const igHref = ig
    ? ig.startsWith("http")
      ? ig
      : `https://instagram.com/${ig.replace(/^@/, "")}`
    : null;
  const fb = config.facebookPage?.trim();
  const email = config.contactEmail?.trim();

  const navLinks = [
    { label: "אודות", href: "#about" },
    { label: "שירותים", href: "#services" },
    { label: "גלריה", href: "#gallery" },
    { label: "ביקורות", href: "#reviews" },
    { label: "שאלות", href: "#faq" },
    { label: "צור קשר", href: "#contact" },
  ] as const;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: VOGUE_NAILS_STYLES }} />
      <div
        className="vogue-nails-root min-h-screen"
        dir="rtl"
        lang="he"
        style={vogueNailsCssVarsFromConfig(config)}
      >
        {!hideHeader ? (
          <header
            className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
              scrolled ? "vvn-glass shadow-lg" : "bg-transparent"
            }`}
          >
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="vvn-font-serif text-2xl tracking-wide text-[hsl(var(--foreground))]"
              >
                {brandName}
              </button>

              <nav className="hidden items-center gap-8 md:flex">
                {navLinks.map((l) => (
                  <button
                    key={l.href}
                    type="button"
                    onClick={() => scrollTo(l.href)}
                    className="text-sm font-medium tracking-wide text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                  >
                    {l.label}
                  </button>
                ))}
                <a
                  href={bookHref}
                  className="rounded-full bg-[hsl(var(--cta))] px-5 py-2 text-sm font-medium text-[hsl(var(--cta-foreground))] transition-opacity hover:opacity-90"
                >
                  הזמנת תור
                </a>
              </nav>

              <button
                type="button"
                className="text-[hsl(var(--foreground))] md:hidden"
                aria-label="תפריט"
                onClick={() => setMenuOpen((o) => !o)}
              >
                {menuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>

            {menuOpen ? (
              <nav className="vvn-glass flex flex-col gap-4 border-t border-[hsl(var(--border)/0.5)] px-6 py-6 md:hidden">
                {navLinks.map((l) => (
                  <button
                    key={l.href}
                    type="button"
                    onClick={() => scrollTo(l.href)}
                    className="text-right text-base text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                  >
                    {l.label}
                  </button>
                ))}
                <a
                  href={bookHref}
                  className="rounded-full bg-[hsl(var(--cta))] px-5 py-3 text-center text-sm font-medium text-[hsl(var(--cta-foreground))]"
                >
                  הזמנת תור
                </a>
              </nav>
            ) : null}
          </header>
        ) : null}

        <main>
          {/* Hero */}
          <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
            <img
              src={heroImage}
              alt=""
              width={1920}
              height={1080}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[hsl(var(--foreground)/0.2)]" />
            <div className="relative z-10 mx-6 max-w-xl rounded-2xl p-10 text-center shadow-2xl vvn-glass md:p-14">
              <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-[hsl(var(--primary))]">
                {heroTagline}
              </p>
              <h1 className="vvn-font-serif text-4xl leading-tight text-[hsl(var(--foreground))] md:text-5xl lg:text-6xl">
                {heroTitle}
              </h1>
              <p className="mb-8 mt-6 text-base leading-relaxed text-[hsl(var(--muted-foreground))] md:text-lg">
                {heroSubtitle}
              </p>
              <a
                href={bookHref}
                className="inline-block rounded-full bg-[hsl(var(--cta))] px-8 py-4 text-base font-medium tracking-wide text-[hsl(var(--cta-foreground))] shadow-lg transition-opacity hover:opacity-90"
              >
                קבעו תור עכשיו
              </a>
            </div>
          </section>

          {/* About */}
          <section id="about" className="vvn-section-padding bg-[hsl(var(--background))]">
            <div
              ref={fadeAbout.ref}
              className={`mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2 lg:gap-20 vvn-fade-in ${
                fadeAbout.visible ? "vvn-fade-in-visible" : ""
              }`}
            >
              <div className="overflow-hidden rounded-2xl shadow-xl">
                <img
                  src={aboutImage}
                  alt=""
                  width={800}
                  height={1024}
                  loading="lazy"
                  className="aspect-[4/5] h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                  הסיפור שלנו
                </p>
                <h2 className="vvn-font-serif mb-6 text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                  {aboutHeading}
                </h2>
                <p className="mb-8 leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {aboutBody}
                </p>
                <div className="space-y-6">
                  {(
                    [
                      {
                        title: "היגיינה ללא פשרות",
                        desc: "ציוד מחוטא וסביבה נקייה — בכל טיפול.",
                      },
                      {
                        title: "מקצועיות",
                        desc: "צוות מיומן וקשוב לפרטים הקטנים.",
                      },
                      {
                        title: "עיצוב אישי",
                        desc: "מקלאסיקה ועד אמנות ציפורניים — לפי הטעם שלכם.",
                      },
                    ] as const
                  ).map((row) => (
                    <div key={row.title} className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))]">
                        <Sparkles size={18} className="text-[hsl(var(--icon))]" />
                      </div>
                      <div>
                        <h3 className="vvn-font-serif mb-1 text-lg text-[hsl(var(--foreground))]">
                          {row.title}
                        </h3>
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">{row.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Services */}
          <section id="services" className="vvn-section-padding bg-[hsl(var(--card))]">
            <div
              ref={fadeServices.ref}
              className={`mx-auto max-w-7xl vvn-fade-in ${
                fadeServices.visible ? "vvn-fade-in-visible" : ""
              }`}
            >
              <div className="mb-14 text-center">
                <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                  מה אנחנו מציעות
                </p>
                <h2 className="vvn-font-serif text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                  השירותים שלנו
                </h2>
              </div>

              {displayServices.length === 0 ? (
                <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
                  עדיין אין שירותים להצגה — הוסיפו שירותים מלוח הבקרה.
                </p>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {displayServices.map((s, i) => {
                    const Icon = SERVICE_ICONS[i % SERVICE_ICONS.length]!;
                    const dur = formatDurationMinutes(s.duration);
                    return (
                      <div
                        key={s.id}
                        className="group rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--background))] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[hsl(var(--primary)/0.4)] hover:shadow-xl"
                      >
                        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--accent))] transition-colors group-hover:bg-[hsl(var(--primary)/0.1)]">
                          <Icon size={22} className="text-[hsl(var(--icon))]" />
                        </div>
                        <h3 className="vvn-font-serif mb-2 text-xl text-[hsl(var(--foreground))]">
                          {s.name}
                        </h3>
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold text-[hsl(var(--primary))]">
                            {formatServicePrice(s)}
                          </span>
                          {dur ? (
                            <span className="text-sm text-[hsl(var(--muted-foreground))]">
                              · {dur}
                            </span>
                          ) : null}
                        </div>
                        {s.description?.trim() ? (
                          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                            {s.description.trim()}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Booking CTA */}
          <section id="booking" className="vvn-section-padding bg-[hsl(var(--background))]">
            <div
              ref={fadeBooking.ref}
              className={`mx-auto max-w-3xl text-center vvn-fade-in ${
                fadeBooking.visible ? "vvn-fade-in-visible" : ""
              }`}
            >
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                הזמנה מהירה
              </p>
              <h2 className="vvn-font-serif mb-4 text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                תורים נפתחים כאן
              </h2>
              <p className="mx-auto mb-10 max-w-xl leading-relaxed text-[hsl(var(--muted-foreground))]">
                בחרו שירות וזמן נוח — הכל מתעדכן בזמן אמת לפי לוח הזמנים של העסק.
              </p>
              <div className="vvn-glass rounded-2xl border border-[hsl(var(--border)/0.5)] p-8 shadow-xl md:p-12">
                <div className="mb-10 grid gap-8 sm:grid-cols-3">
                  {(
                    [
                      { icon: Clock, title: "שעות ברורות", desc: "לפי ההגדרות שלכם במערכת" },
                      { icon: Bell, title: "התראות", desc: "וואטסאפ ומייל לפי ההגדרות" },
                      { icon: CheckCircle, title: "אישור מיידי", desc: "אחרי בחירת השירות והזמן" },
                    ] as const
                  ).map((item) => (
                    <div key={item.title} className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--accent))]">
                        <item.icon size={20} className="text-[hsl(var(--icon))]" />
                      </div>
                      <h3 className="vvn-font-serif text-base text-[hsl(var(--foreground))]">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <a
                  href={bookHref}
                  className="inline-block rounded-full bg-[hsl(var(--cta))] px-10 py-4 text-base font-medium tracking-wide text-[hsl(var(--cta-foreground))] shadow-lg transition-opacity hover:opacity-90"
                >
                  מעבר לדף הזמנה
                </a>
              </div>
            </div>
          </section>

          {/* Gallery */}
          <section id="gallery" className="vvn-section-padding bg-[hsl(var(--card))]">
            <div
              ref={fadeGallery.ref}
              className={`mx-auto max-w-7xl vvn-fade-in ${
                fadeGallery.visible ? "vvn-fade-in-visible" : ""
              }`}
            >
              <div className="mb-14 text-center">
                <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                  גלריה
                </p>
                <h2 className="vvn-font-serif text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                  עבודות נבחרות
                </h2>
              </div>
              <div className="columns-2 gap-4 space-y-4 md:columns-3">
                {galleryImages.map((src, i) => (
                  <div
                    key={`${src}-${i}`}
                    className="relative break-inside-avoid overflow-hidden rounded-xl group"
                  >
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Reviews */}
          {reviews.length > 0 ? (
            <section id="reviews" className="vvn-section-padding bg-[hsl(var(--background))]">
              <div
                ref={fadeReviews.ref}
                className={`mx-auto max-w-7xl vvn-fade-in ${
                  fadeReviews.visible ? "vvn-fade-in-visible" : ""
                }`}
              >
                <div className="mb-14 text-center">
                  <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                    לקוחות מספרות
                  </p>
                  <h2 className="vvn-font-serif text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                    ביקורות
                  </h2>
                </div>
                <div className="grid gap-6 md:grid-cols-3">
                  {reviews.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card))] p-8 transition-shadow hover:shadow-lg"
                    >
                      <div className="mb-4 flex gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            className={
                              i < r.rating
                                ? "fill-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                                : "text-[hsl(var(--border))]"
                            }
                          />
                        ))}
                      </div>
                      <p className="mb-6 text-sm italic leading-relaxed text-[hsl(var(--muted-foreground))]">
                        &ldquo;{r.text.trim()}&rdquo;
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-sm font-medium text-[hsl(var(--primary))]">
                          {(r.name || "?").slice(0, 2)}
                        </div>
                        <span className="vvn-font-serif text-[hsl(var(--foreground))]">
                          {r.name || "לקוח/ה"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* FAQ */}
          {faqs.length > 0 ? (
            <section id="faq" className="vvn-section-padding bg-[hsl(var(--card))]">
              <div
                ref={fadeFaq.ref}
                className={`mx-auto max-w-3xl vvn-fade-in ${
                  fadeFaq.visible ? "vvn-fade-in-visible" : ""
                }`}
              >
                <div className="mb-14 text-center">
                  <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                    שאלות נפוצות
                  </p>
                  <h2 className="vvn-font-serif text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                    לפני שמגיעים
                  </h2>
                </div>
                <div className="space-y-3">
                  {faqs.map((f) => (
                    <details key={f.id} className="vvn-faq-details group">
                      <summary className="vvn-faq-summary">{f.question}</summary>
                      <div className="vvn-faq-body">{f.answer}</div>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* Contact */}
          <section id="contact" className="vvn-section-padding bg-[hsl(var(--background))]">
            <div
              ref={fadeContact.ref}
              className={`mx-auto max-w-7xl vvn-fade-in ${
                fadeContact.visible ? "vvn-fade-in-visible" : ""
              }`}
            >
              <div className="mb-14 text-center">
                <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-[hsl(var(--primary))]">
                  איך מגיעים
                </p>
                <h2 className="vvn-font-serif text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                  צרו קשר
                </h2>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                {mapEmbed ? (
                  <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border)/0.6)] shadow-lg">
                    <iframe
                      title="מפה"
                      src={mapEmbed}
                      className="h-full min-h-[320px] w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      style={{ border: 0 }}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--muted-foreground))]">
                    הוסיפו כתובת בעסק כדי להציג מפה
                  </div>
                )}
                <div className="space-y-8">
                  <div className="space-y-5">
                    {addressLine ? (
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))]">
                          <MapPin size={18} className="text-[hsl(var(--icon))]" />
                        </div>
                        <p className="pt-2 text-sm text-[hsl(var(--muted-foreground))]">{addressLine}</p>
                      </div>
                    ) : null}
                    {phoneDisplay ? (
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))]">
                          <Phone size={18} className="text-[hsl(var(--icon))]" />
                        </div>
                        <a
                          href={`tel:${digitsOnly(phoneDisplay)}`}
                          className="pt-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                          dir="ltr"
                        >
                          {phoneDisplay}
                        </a>
                      </div>
                    ) : null}
                    {email ? (
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))]">
                          <Mail size={18} className="text-[hsl(var(--icon))]" />
                        </div>
                        <a
                          href={`mailto:${email}`}
                          className="pt-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                          dir="ltr"
                        >
                          {email}
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-4 flex items-center gap-3">
                      <Clock size={18} className="text-[hsl(var(--icon))]" />
                      <h3 className="vvn-font-serif text-lg text-[hsl(var(--foreground))]">שעות פעילות</h3>
                    </div>
                    <div className="space-y-3">
                      {hourRows.map((h) => (
                        <div
                          key={h.label}
                          className="flex justify-between gap-4 border-b border-[hsl(var(--border)/0.5)] pb-3 text-sm"
                        >
                          <span className="font-medium text-[hsl(var(--foreground))]">{h.label}</span>
                          <span className="text-[hsl(var(--muted-foreground))]" dir="ltr">
                            {h.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {igHref || fb || waHref ? (
                    <div className="flex gap-4 pt-2">
                      {igHref ? (
                        <a
                          href={igHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                          aria-label="אינסטגרם"
                        >
                          <Instagram size={22} />
                        </a>
                      ) : null}
                      {fb ? (
                        <a
                          href={fb.startsWith("http") ? fb : `https://facebook.com/${fb}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                          aria-label="פייסבוק"
                        >
                          <Facebook size={22} />
                        </a>
                      ) : null}
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                          aria-label="וואטסאפ"
                        >
                          <Phone size={22} />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="bg-[hsl(var(--foreground))] px-6 py-12 text-[hsl(var(--primary-foreground))]">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row">
            <div className="text-center md:text-right">
              <h3 className="vvn-font-serif mb-1 text-xl">{brandName}</h3>
              <p className="text-sm opacity-60">
                {addressLine || "סטודיו לציפורניים"}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              {navLinks.slice(0, 5).map((l) => (
                <button
                  key={l.href}
                  type="button"
                  onClick={() => scrollTo(l.href)}
                  className="text-sm opacity-60 transition-opacity hover:opacity-100"
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              {igHref ? (
                <a
                  href={igHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--primary-foreground)/0.2)] transition-colors hover:bg-[hsl(var(--primary-foreground)/0.1)]"
                  aria-label="אינסטגרם"
                >
                  <Instagram size={18} />
                </a>
              ) : null}
              {fb ? (
                <a
                  href={fb.startsWith("http") ? fb : `https://facebook.com/${fb}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--primary-foreground)/0.2)] transition-colors hover:bg-[hsl(var(--primary-foreground)/0.1)]"
                  aria-label="פייסבוק"
                >
                  <Facebook size={18} />
                </a>
              ) : null}
            </div>
          </div>
          <div className="mx-auto mt-8 max-w-7xl border-t border-[hsl(var(--primary-foreground)/0.1)] pt-6 text-center">
            <p className="text-xs opacity-40">
              © {new Date().getFullYear()} {brandName}. כל הזכויות שמורות.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default VogueNailsShell;
