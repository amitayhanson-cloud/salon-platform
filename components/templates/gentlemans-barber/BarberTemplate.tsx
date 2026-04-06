"use client";

/**
 * The Gents Club — flattened landing (Hero, Services, Barbers, Waitlist, Gallery, Contact, Header, Footer).
 * Ported from Lovable "the-gents-club-landing" as one file for manual wiring to Caleno / Firestore.
 *
 * Uses <img> for remote placeholders so next.config remotePatterns need not include Unsplash.
 */

import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle,
  Clock,
  Facebook,
  Flame,
  Instagram,
  MapPin,
  Menu,
  PenTool,
  Phone,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import { getSiteUrl } from "@/lib/tenant";
import { barberCssVarsFromConfig } from "@/lib/scopedSkinCssVars";
import { defaultSiteConfig } from "@/types/siteConfig";

// ---------------------------------------------------------------------------
// Placeholder images (swap for /public/... or CMS URLs)
// ---------------------------------------------------------------------------

const IMAGE_HERO =
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1920&q=80";
const IMAGE_GALLERY = [
  {
    src: "https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?w=800&q=80",
    alt: "תספורת מדויקת",
    tall: true,
  },
  {
    src: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&q=80",
    alt: "גילוח במגבת חמה",
    tall: false,
  },
  {
    src: "https://images.unsplash.com/photo-1621607512214-68297480165e?w=800&q=80",
    alt: "עיצוב זקן",
    tall: true,
  },
  {
    src: "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=800&q=80",
    alt: "מוצרי טיפוח פרימיום",
    tall: false,
  },
  {
    src: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&q=80",
    alt: "כיסא ספר מפואר",
    tall: true,
  },
  {
    src: "https://images.unsplash.com/photo-1599351431202-1e0f03618d80?w=800&q=80",
    alt: "סטייל מוגמר",
    tall: false,
  },
] as const;
const IMAGE_BARBERS = [
  {
    name: "מרקוס ריברה",
    specialty: "פיידים ותספורות מדויקות",
    src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&q=80",
    available: true,
  },
  {
    name: "ג׳ייק ת׳ורנטון",
    specialty: "קלאסי ומרקמים",
    src: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=512&q=80",
    available: true,
  },
  {
    name: "וינסנט מורו",
    specialty: "גילוח מסורתי וזקנים",
    src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=512&q=80",
    available: false,
  },
] as const;

const SERVICE_ICONS = [Scissors, Flame, PenTool, Sparkles] as const;

const HOURS = [
  { day: "ראשון – חמישי", time: "09:00–20:00" },
  { day: "שישי", time: "08:00–14:00" },
  { day: "שבת", time: "סגור" },
] as const;

const NAV_LINKS = [
  { label: "שירותים", href: "#services" },
  { label: "הספרים", href: "#barbers" },
  { label: "גלריה", href: "#gallery" },
  { label: "צור קשר", href: "#contact" },
] as const;

/**
 * Scoped theme + utilities (Lovable index.css) under `.gents-barber-root`.
 * Same isolation pattern as Vogue Nails (`VOGUE_NAILS_STYLES` / `.vogue-nails-root`).
 */
const GENTS_BARBER_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Rubik:wght@300;400;500;600;700&display=swap');

.gents-barber-root {
  direction: rtl;
  --background: 0 0% 10%;
  --foreground: 40 10% 90%;
  --card: 0 0% 12%;
  --card-foreground: 40 10% 90%;
  --primary: 43 76% 52%;
  --primary-foreground: 0 0% 10%;
  --secondary: 25 76% 31%;
  --secondary-foreground: 40 10% 90%;
  --muted: 0 0% 16%;
  --muted-foreground: 40 5% 55%;
  --accent: 25 76% 31%;
  --accent-foreground: 40 10% 90%;
  --border: 0 0% 20%;
  --input: 0 0% 20%;
  --ring: 43 76% 52%;
  --radius: 0.5rem;
  --gold: 43 76% 52%;
  --gold-glow: 43 76% 62%;
  --charcoal: 0 0% 10%;
  --font-heading: 'Frank Ruhl Libre', 'David Libre', Georgia, serif;
  --font-body: 'Rubik', system-ui, sans-serif;
  font-family: var(--font-body);
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  scroll-behavior: smooth;
}

.gents-barber-root h1,
.gents-barber-root h2,
.gents-barber-root h3,
.gents-barber-root h4,
.gents-barber-root h5,
.gents-barber-root h6 {
  font-family: var(--font-heading);
}

.gents-barber-root .gbc-font-heading {
  font-family: var(--font-heading);
}

.gents-barber-root .gbc-text-gold-gradient {
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  background-image: linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-glow)));
}

.gents-barber-root .gbc-glass {
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom-width: 1px;
  background: hsl(var(--charcoal) / 0.8);
  border-color: hsl(var(--border) / 0.5);
}

.gents-barber-root .gbc-gold-border-hover:hover {
  border-color: hsl(var(--gold) / 0.6);
}

.gents-barber-root .gbc-section-fade-in {
  animation: gbcSectionFadeIn 0.8s ease-out forwards;
  opacity: 0;
}

@keyframes gbcSectionFadeIn {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.gents-barber-root .gbc-hover-lift {
  transition: all 0.3s;
}
.gents-barber-root .gbc-hover-lift:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 40px -15px hsl(var(--primary) / 0.15);
}

.gents-barber-root .gbc-btn-primary {
  background-color: hsl(var(--cta));
  color: hsl(var(--cta-foreground));
}
.gents-barber-root .gbc-btn-primary:hover {
  background-color: hsl(var(--gold-glow));
}
`;

function useScrollFadeIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
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

export type BarberTemplateProps = {
  siteId?: string;
  config?: SiteConfig | null;
  services?: SiteService[];
  /** Hide fixed nav header (e.g. builder live preview). */
  hideHeader?: boolean;
};

function formatBarberServicePrice(s: SiteService): string {
  if (s.price === undefined || s.price === null || s.price === "") return "—";
  if (typeof s.price === "number") return `₪${s.price}`;
  const t = String(s.price).trim();
  return t || "—";
}

function formatBarberDuration(min: number | undefined): string {
  if (min === undefined || min === null || Number.isNaN(min)) return "";
  return `${min} דק׳`;
}

export function BarberTemplate({
  siteId,
  config,
  services = [],
  hideHeader = false,
}: BarberTemplateProps = {}) {
  const brandName = config?.salonName?.trim() || "מועדון הג׳נטלמן";
  const bookHref =
    siteId != null && siteId !== ""
      ? getSiteUrl(config?.slug ?? null, siteId, "/book")
      : "#waitlist";

  const displayServices = services.filter((s) => s.enabled !== false);

  const heroTagline =
    config?.content?.hero?.tagline?.trim() || "מאז 2019 · טיפוח פרימיום לגבר";
  const heroTitleCustom = config?.content?.hero?.title?.trim();
  const heroSubtitle =
    config?.content?.hero?.subtitle?.trim() ||
    "מסורת לצד דיוק. חוויית תספורת וגילוח באווירה יוקרתית ומוקפדת.";

  const [mobileOpen, setMobileOpen] = useState(false);

  const fadeServices = useScrollFadeIn();
  const fadeBarbers = useScrollFadeIn();
  const fadeWaitlist = useScrollFadeIn();
  const fadeGallery = useScrollFadeIn();
  const fadeContact = useScrollFadeIn();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GENTS_BARBER_STYLES }} />
      <div
        className="gents-barber-root min-h-screen"
        dir="rtl"
        lang="he"
        style={barberCssVarsFromConfig(config ?? defaultSiteConfig)}
      >
        {!hideHeader ? (
          <header className="gbc-glass fixed left-0 right-0 top-0 z-50">
            <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
              <a href="#" className="gbc-font-heading text-xl font-bold tracking-wide text-[hsl(var(--primary))]">
                {brandName}
              </a>

              <nav className="hidden items-center gap-8 md:flex">
                {NAV_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="text-sm font-medium tracking-wide text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                  >
                    {l.label}
                  </a>
                ))}
                <a
                  href={bookHref}
                  className="gbc-btn-primary rounded-sm px-5 py-2 text-sm font-semibold transition-all"
                >
                  הזמינו תור
                </a>
              </nav>

              <button
                type="button"
                className="text-[hsl(var(--foreground))] md:hidden"
                aria-label="תפריט"
                onClick={() => setMobileOpen((o) => !o)}
              >
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>

            {mobileOpen ? (
              <nav className="gbc-glass flex flex-col gap-4 border-t border-[hsl(var(--border)/0.5)] px-6 pb-6 pt-2 md:hidden">
                {NAV_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                    onClick={() => setMobileOpen(false)}
                  >
                    {l.label}
                  </a>
                ))}
                <a
                  href={bookHref}
                  className="gbc-btn-primary rounded-sm px-5 py-2 text-center text-sm font-semibold"
                  onClick={() => setMobileOpen(false)}
                >
                  הזמינו תור
                </a>
              </nav>
            ) : null}
          </header>
        ) : null}

        <main>
          <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
            <img
              src={IMAGE_HERO}
              alt="פנים מספרת פאר"
              width={1920}
              height={1080}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--background)/0.7)] via-[hsl(var(--background)/0.5)] to-[hsl(var(--background))]" />

            <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
              <p className="mb-4 text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
                {heroTagline}
              </p>
              {heroTitleCustom ? (
                <h1 className="gbc-font-heading text-4xl font-bold leading-tight text-[hsl(var(--foreground))] sm:text-5xl md:text-6xl lg:text-7xl">
                  {heroTitleCustom}
                </h1>
              ) : (
                <h1 className="gbc-font-heading text-4xl font-bold leading-tight text-[hsl(var(--foreground))] sm:text-5xl md:text-6xl lg:text-7xl">
                  מספרה שמכבדת
                  <br />
                  <span className="gbc-text-gold-gradient">את הגבר המודרני</span>
                </h1>
              )}
              <p className="mx-auto mt-6 max-w-lg text-base text-[hsl(var(--muted-foreground))] sm:text-lg">
                {heroSubtitle}
              </p>
              <a
                href="#services"
                className="gbc-btn-primary mt-8 inline-block rounded-sm px-8 py-3.5 text-sm font-bold shadow-[0_0_30px_hsl(var(--primary)/0.3)] transition-all hover:shadow-[0_0_30px_hsl(var(--primary)/0.3)]"
              >
                בחרו כיסא
              </a>
            </div>
          </section>

          <section id="services" className="py-24 sm:py-32">
            <div
              ref={fadeServices.ref}
              className={`mx-auto max-w-[1400px] px-6 ${fadeServices.visible ? "gbc-section-fade-in" : "opacity-0"}`}
            >
              <p className="text-center text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
                מה אנחנו מציעים
              </p>
              <h2 className="gbc-font-heading mt-3 text-center text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
                תפריט שירותים
              </h2>

              <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {displayServices.length === 0 ? (
                  <p className="col-span-full text-center text-sm text-[hsl(var(--muted-foreground))]">
                    עדיין אין שירותים להצגה — הוסיפו שירותים מלוח הבקרה.
                  </p>
                ) : (
                  displayServices.map((svc, i) => {
                    const Icon = SERVICE_ICONS[i % SERVICE_ICONS.length]!;
                    const dur = formatBarberDuration(svc.duration);
                    return (
                      <div
                        key={svc.id}
                        className="gbc-hover-lift gbc-gold-border-hover group rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 transition-colors"
                      >
                        <Icon className="h-8 w-8 text-[hsl(var(--icon))]" />
                        <h3 className="gbc-font-heading mt-5 text-xl font-semibold text-[hsl(var(--foreground))]">
                          {svc.name}
                        </h3>
                        {svc.description?.trim() ? (
                          <p className="mt-3 text-right text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                            {svc.description.trim()}
                          </p>
                        ) : null}
                        <div className="mt-6 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4">
                          <span className="text-lg font-bold text-[hsl(var(--primary))]">
                            {formatBarberServicePrice(svc)}
                          </span>
                          {dur ? (
                            <span className="text-xs tracking-wide text-[hsl(var(--muted-foreground))]">
                              {dur}
                            </span>
                          ) : (
                            <span />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <section id="barbers" className="bg-[hsl(var(--card))] py-24 sm:py-32">
            <div
              ref={fadeBarbers.ref}
              className={`mx-auto max-w-[1400px] px-6 ${fadeBarbers.visible ? "gbc-section-fade-in" : "opacity-0"}`}
            >
              <p className="text-center text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
                הכירו את הצוות
              </p>
              <h2 className="gbc-font-heading mt-3 text-center text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
                הספרים
              </h2>

              <div className="mt-16 flex flex-wrap justify-center gap-12">
                {IMAGE_BARBERS.map((b) => (
                  <div key={b.name} className="group flex flex-col items-center text-center">
                    <div className="relative h-44 w-44 overflow-hidden rounded-full border-2 border-[hsl(var(--border))] transition-all duration-500 group-hover:border-[hsl(var(--primary))] group-hover:shadow-[0_0_30px_hsl(var(--primary)/0.2)]">
                      <img
                        src={b.src}
                        alt={b.name}
                        width={512}
                        height={512}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                    <h3 className="gbc-font-heading mt-5 text-lg font-semibold text-[hsl(var(--foreground))]">
                      {b.name}
                    </h3>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{b.specialty}</p>
                    {b.available ? (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] px-3 py-1 text-xs font-medium text-[hsl(var(--primary))]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--primary))]" />
                        זמין היום
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="waitlist" className="py-24 sm:py-32">
            <div
              ref={fadeWaitlist.ref}
              className={`mx-auto max-w-2xl px-6 ${fadeWaitlist.visible ? "gbc-section-fade-in" : "opacity-0"}`}
            >
              <p className="text-center text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
                אל תפספסו
              </p>
              <h2 className="gbc-font-heading mt-3 text-center text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
                אין תור פנוי?
              </h2>

              <div className="mt-12 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 sm:p-10">
                <h3 className="gbc-font-heading text-right text-xl font-semibold text-[hsl(var(--foreground))]">
                  רשימת המתנה חכמה
                </h3>
                <p className="mt-3 text-right text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  הצטרפו לרשימת המתנה ונעדכן אתכם ברגע שנתפנה כיסא — בלי רענון ובלי לחץ, טיפוח פרימיום בזמן שנוח לכם.
                </p>

                <div className="mt-8 grid gap-5 sm:grid-cols-3">
                  {(
                    [
                      { icon: Clock, text: "הרשמה תוך שניות" },
                      { icon: Bell, text: "התראות מיידיות" },
                      { icon: CheckCircle, text: "אישור — ואתם בפנים" },
                    ] as const
                  ).map((item) => (
                    <div key={item.text} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 shrink-0 text-[hsl(var(--icon))]" />
                      <span className="text-right text-sm text-[hsl(var(--muted-foreground))]">{item.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="gbc-btn-primary mt-8 w-full rounded-sm py-3 text-sm font-bold shadow-[0_0_30px_hsl(var(--primary)/0.3)] transition-all"
                >
                  הצטרפו לרשימת המתנה
                </button>
              </div>
            </div>
          </section>

          <section id="gallery" className="bg-[hsl(var(--card))] py-24 sm:py-32">
            <div
              ref={fadeGallery.ref}
              className={`mx-auto max-w-[1400px] px-6 ${fadeGallery.visible ? "gbc-section-fade-in" : "opacity-0"}`}
            >
              <p className="text-center text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
                העבודות שלנו
              </p>
              <h2 className="gbc-font-heading mt-3 text-center text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
                גלריה
              </h2>

              <div className="mt-16 columns-1 gap-4 sm:columns-2 lg:columns-3">
                {IMAGE_GALLERY.map((img, i) => (
                  <div key={i} className="mb-4 break-inside-avoid overflow-hidden rounded-lg">
                    <img
                      src={img.src}
                      alt={img.alt}
                      width={640}
                      height={img.tall ? 800 : 640}
                      loading="lazy"
                      className="w-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="contact" className="py-24 sm:py-32">
            <div
              ref={fadeContact.ref}
              className={`mx-auto max-w-[1400px] px-6 ${fadeContact.visible ? "gbc-section-fade-in" : "opacity-0"}`}
            >
              <p className="text-center text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
                איפה אנחנו
              </p>
              <h2 className="gbc-font-heading mt-3 text-center text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
                כתובת ושעות פעילות
              </h2>

              <div className="mt-16 grid gap-8 lg:grid-cols-2">
                <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                  <iframe
                    title="מיקום המספרה"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.2!2d-73.9857!3d40.7484!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDDCsDQ0JzU0LjIiTiA3M8KwNTknMDguNSJX!5e0!3m2!1sen!2sus!4v1"
                    className="h-72 w-full border-0 grayscale lg:h-full lg:min-h-[320px]"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>

                <div className="flex flex-col justify-center gap-8">
                  <div className="flex items-start gap-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--icon))]" />
                    <div className="text-right">
                      <h3 className="gbc-font-heading text-lg font-semibold text-[hsl(var(--foreground))]">כתובת</h3>
                      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        רחוב הרצל 1, תל אביב (לדוגמה)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--icon))]" />
                    <div className="text-right">
                      <h3 className="gbc-font-heading text-lg font-semibold text-[hsl(var(--foreground))]">שעות</h3>
                      <div className="mt-1 space-y-1">
                        {HOURS.map((h) => (
                          <div
                            key={h.day}
                            className="flex justify-between gap-8 text-sm text-[hsl(var(--muted-foreground))]"
                          >
                            <span>{h.day}</span>
                            <span dir="ltr" className="tabular-nums">
                              {h.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--icon))]" />
                    <div className="text-right">
                      <h3 className="gbc-font-heading text-lg font-semibold text-[hsl(var(--foreground))]">יצירת קשר</h3>
                      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]" dir="ltr">
                        03-555-0147
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <a
                      href="#"
                      className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                      aria-label="אינסטגרם"
                    >
                      <Instagram size={22} />
                    </a>
                    <a
                      href="#"
                      className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]"
                      aria-label="פייסבוק"
                    >
                      <Facebook size={22} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] py-8">
          <div className="mx-auto max-w-[1400px] px-6 text-center">
            <p className="gbc-font-heading text-sm font-bold tracking-wide text-[hsl(var(--primary))]">
              {brandName}
            </p>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              © {new Date().getFullYear()} {brandName}. כל הזכויות שמורות.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default BarberTemplate;
