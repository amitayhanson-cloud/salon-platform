"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getSiteUrl } from "@/lib/tenant";
import { BookNowNavButton } from "@/components/publicSite/BookNowNavButton";
import { DEFAULT_CONTENT } from "@/lib/editor/defaultContent";
import type { SiteContent } from "@/types/siteConfig";

const NAV_IDS = [
  { key: "navAbout", id: "about-section" },
  { key: "navServices", id: "services-section" },
  { key: "navGallery", id: "gallery-section" },
] as const;

const LOGO_HEIGHT = 44;

const EDITOR_ATTRS = {
  headerText: {
    "data-edit-id": "headerText",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.brandName"]',
    "data-edit-label": "שם הסלון בכותרת",
  },
  headerNavAbout: {
    "data-edit-id": "headerNavLink",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.navAbout"]',
    "data-edit-label": "קישור אודות",
  },
  headerNavServices: {
    "data-edit-id": "headerNavLink",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.navServices"]',
    "data-edit-label": "קישור שירותים",
  },
  headerNavGallery: {
    "data-edit-id": "headerNavLink",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.navGallery"]',
    "data-edit-label": "קישור גלריה",
  },
  headerCtaButton: {
    "data-edit-id": "headerCtaButton",
    "data-edit-kind": "button",
    "data-edit-paths": '["content.header.navCtaBook","content.header.navCtaContact"]',
    "data-edit-label": "כפתור קביעת תור בכותרת",
  },
} as const;

export default function SalonHeader({
  salonName,
  siteId,
  slug,
  bookingEnabled: isBookingEnabled,
  scrollToSection,
  logoUrl,
  logoAlt,
  editorMode = false,
  headerBg,
  headerText,
  headerLink,
  headerCtaBg,
  headerCtaText,
  contentHeader,
  showShopLink = false,
  shopHref,
}: {
  salonName: string;
  siteId: string;
  slug?: string | null;
  bookingEnabled: boolean;
  scrollToSection: (id: string) => void;
  logoUrl?: string | null;
  logoAlt?: string;
  editorMode?: boolean;
  headerBg?: string;
  headerText?: string;
  headerLink?: string;
  headerCtaBg?: string;
  headerCtaText?: string;
  contentHeader?: SiteContent["header"];
  /** When true with shopHref, show Shop nav link to full catalog */
  showShopLink?: boolean;
  shopHref?: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pillRef = useRef<HTMLElement>(null);
  const [mobileMenuTop, setMobileMenuTop] = useState(0);
  /** Broken URL / failed load: show salon name like when there is no logo */
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const edit = editorMode ? (key: keyof typeof EDITOR_ATTRS) => EDITOR_ATTRS[key] : () => ({});

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [logoUrl]);

  const showLogoImage = Boolean(logoUrl?.trim()) && !logoLoadFailed;
  const logoAltResolved =
    logoAlt?.trim() && logoAlt.trim().toLowerCase() !== "logo"
      ? logoAlt.trim()
      : salonName;

  const navLabel = (key: keyof NonNullable<SiteContent["header"]>) =>
    contentHeader?.[key]?.trim() ? contentHeader[key]! : DEFAULT_CONTENT.header[key];

  const resolvedShopHref = shopHref?.trim() || getSiteUrl(slug, siteId, "/shop");

  const handleNavClick = (id: string) => {
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  const bgColor = headerBg ?? "rgba(0,0,0,0.5)";
  const textColor = headerText ?? "#ffffff";
  const linkColor = headerLink ?? "rgba(255,255,255,0.9)";
  const ctaBg = headerCtaBg ?? "var(--primary)";
  const ctaText = headerCtaText ?? "var(--primaryText)";

  useEffect(() => {
    if (!mobileMenuOpen || typeof window === "undefined") return;
    const updateTop = () => {
      const el = pillRef.current;
      if (el) setMobileMenuTop(el.getBoundingClientRect().bottom);
    };
    updateTop();
    window.addEventListener("resize", updateTop);
    window.addEventListener("scroll", updateTop, true);
    return () => {
      window.removeEventListener("resize", updateTop);
      window.removeEventListener("scroll", updateTop, true);
    };
  }, [mobileMenuOpen]);

  const headerStyle: import("react").CSSProperties = {
    backgroundColor: bgColor,
    backdropFilter: "saturate(180%) blur(20px)",
    WebkitBackdropFilter: "saturate(180%) blur(20px)",
  };

  return (
    <>
      <header
        ref={pillRef}
        dir="rtl"
        className="relative z-20 w-full max-w-6xl text-right transition-[background,backdrop-filter] rounded-full border border-white/25 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.35)_inset] backdrop-blur-xl"
        style={headerStyle}
      >
        {/* Mobile: hamburger fixed left edge of pill; logo/name fixed right (same as desktop col3) */}
        <div className="relative h-16 max-w-6xl mx-auto md:hidden px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus:outline-none focus-visible:bg-white/15 active:outline-none lg:left-8"
            style={{ color: linkColor }}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "סגור תפריט" : "פתח תפריט"}
          >
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <div
            className="absolute right-4 top-1/2 flex max-w-[min(70%,calc(100%-4rem))] -translate-y-1/2 items-center justify-end lg:right-8"
            {...(showLogoImage ? {} : edit("headerText"))}
          >
            {showLogoImage ? (
              editorMode ? (
                <span
                  className="flex shrink-0 items-center rounded-full"
                  style={{ height: LOGO_HEIGHT }}
                  aria-hidden
                >
                  <img
                    src={logoUrl!}
                    alt=""
                    role="presentation"
                    onError={() => setLogoLoadFailed(true)}
                    className="h-full w-auto object-contain"
                    style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
                  />
                </span>
              ) : (
                <Link
                  href={getSiteUrl(slug, siteId, "")}
                  className="flex shrink-0 items-center rounded-full focus:outline-none focus-visible:bg-white/10 active:outline-none"
                  style={{ height: LOGO_HEIGHT }}
                  aria-label={logoAltResolved || "דף הבית"}
                >
                  <img
                    src={logoUrl!}
                    alt=""
                    role="presentation"
                    onError={() => setLogoLoadFailed(true)}
                    className="h-full w-auto object-contain"
                    style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
                  />
                </Link>
              )
            ) : (
              <span
                dir="rtl"
                lang="he"
                className="truncate text-right text-xl font-semibold tracking-wide"
                style={{ unicodeBidi: "plaintext", color: textColor }}
              >
                {salonName}
              </span>
            )}
          </div>
        </div>

        {/* Desktop: 3-column grid, menu centered */}
        <div className="mx-auto hidden h-16 max-w-6xl grid-cols-3 items-center gap-4 px-4 lg:px-8 md:grid">
          <div className="flex min-w-0 items-center justify-start" {...(showLogoImage ? {} : edit("headerText"))}>
            {!showLogoImage && (
              <span
                dir="rtl"
                lang="he"
                className="text-xl font-semibold tracking-wide"
                style={{ unicodeBidi: "plaintext", color: textColor }}
              >
                {salonName}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center">
            <nav className="flex items-center gap-8" aria-label="ניווט ראשי">
              {NAV_IDS.map(({ key, id }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleNavClick(id)}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-white/15 focus:outline-none focus-visible:bg-white/15 active:outline-none active:bg-white/10"
                  style={{ color: linkColor }}
                  {...edit(key === "navAbout" ? "headerNavAbout" : key === "navServices" ? "headerNavServices" : "headerNavGallery")}
                >
                  {navLabel(key)}
                </button>
              ))}
              {showShopLink ? (
                <Link
                  href={resolvedShopHref}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-white/15 focus:outline-none focus-visible:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/35"
                  style={{ color: linkColor }}
                >
                  {navLabel("navShop")}
                </Link>
              ) : null}
              {isBookingEnabled ? (
                <BookNowNavButton
                  href={getSiteUrl(slug, siteId, "/book")}
                  className="whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 active:outline-none disabled:opacity-90"
                  style={{ backgroundColor: ctaBg, color: ctaText }}
                  {...edit("headerCtaButton")}
                >
                  {navLabel("navCtaBook")}
                </BookNowNavButton>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNavClick("contact-section")}
                  className="whitespace-nowrap rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 active:outline-none"
                  style={{ color: ctaText }}
                  {...edit("headerCtaButton")}
                >
                  {navLabel("navCtaContact")}
                </button>
              )}
            </nav>
          </div>

          <div className="flex min-w-0 items-center justify-end">
            {showLogoImage ? (
              editorMode ? (
                <span
                  className="flex shrink-0 items-center rounded-full"
                  style={{ height: LOGO_HEIGHT }}
                  aria-hidden
                >
                  <img
                    src={logoUrl!}
                    alt=""
                    role="presentation"
                    onError={() => setLogoLoadFailed(true)}
                    className="h-full w-auto object-contain"
                    style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
                  />
                </span>
              ) : (
                <Link
                  href={getSiteUrl(slug, siteId, "")}
                  className="flex shrink-0 items-center rounded-full focus:outline-none focus-visible:bg-white/10 active:outline-none"
                  style={{ height: LOGO_HEIGHT }}
                  aria-label={logoAltResolved || "דף הבית"}
                >
                  <img
                    src={logoUrl!}
                    alt=""
                    role="presentation"
                    onError={() => setLogoLoadFailed(true)}
                    className="h-full w-auto object-contain"
                    style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
                  />
                </Link>
              )
            ) : (
              <span className="w-0" aria-hidden />
            )}
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[109] bg-black/40 md:hidden"
            aria-label="סגור תפריט"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className="fixed left-0 z-[110] w-[min(88vw,300px)] max-w-sm rounded-r-2xl border-y border-r border-white/15 bg-black/95 py-4 pl-3 pr-4 shadow-2xl md:hidden overflow-y-auto"
            style={{
              top: mobileMenuTop > 0 ? `${mobileMenuTop}px` : "5.5rem",
              maxHeight: mobileMenuTop > 0 ? `calc(100vh - ${mobileMenuTop}px - 12px)` : "min(70vh, 420px)",
              backdropFilter: "saturate(180%) blur(16px)",
            }}
          >
          {showLogoImage ? (
            editorMode ? (
              <span
                className="flex justify-start rounded-full py-3"
                style={{ height: LOGO_HEIGHT }}
                aria-hidden
              >
                <img
                  src={logoUrl!}
                  alt=""
                  role="presentation"
                  onError={() => setLogoLoadFailed(true)}
                  className="h-full w-auto object-contain object-left max-w-full"
                  style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
                />
              </span>
            ) : (
              <Link
                href={getSiteUrl(slug, siteId, "")}
                onClick={() => setMobileMenuOpen(false)}
                className="flex justify-start rounded-full py-3 focus:outline-none focus-visible:bg-white/10 active:outline-none"
                style={{ height: LOGO_HEIGHT }}
                aria-label={logoAltResolved || "דף הבית"}
              >
                <img
                  src={logoUrl!}
                  alt=""
                  role="presentation"
                  onError={() => setLogoLoadFailed(true)}
                  className="h-full w-auto object-contain object-left max-w-full"
                  style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
                />
              </Link>
            )
          ) : (
            <p className="py-3 text-right text-lg font-semibold" style={{ color: textColor }}>
              {salonName}
            </p>
          )}
          <nav className="flex flex-col gap-1" aria-label="ניווט ראשי (נייד)">
            {NAV_IDS.map(({ key, id }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavClick(id)}
                className="w-full rounded-full py-3 pr-3 pl-2 text-right text-base font-medium transition-colors hover:bg-white/12 focus:outline-none focus-visible:bg-white/12 active:outline-none"
                style={{ color: linkColor }}
                {...edit(key === "navAbout" ? "headerNavAbout" : key === "navServices" ? "headerNavServices" : "headerNavGallery")}
              >
                {navLabel(key)}
              </button>
            ))}
            {showShopLink ? (
              <Link
                href={resolvedShopHref}
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full rounded-full py-3 pr-3 pl-2 text-right text-base font-medium transition-colors hover:bg-white/12 focus:outline-none focus-visible:bg-white/12"
                style={{ color: linkColor }}
              >
                {navLabel("navShop")}
              </Link>
            ) : null}
            {isBookingEnabled ? (
              <BookNowNavButton
                href={getSiteUrl(slug, siteId, "/book")}
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 w-full whitespace-nowrap rounded-full px-5 py-3 text-center text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 active:outline-none"
                style={{ backgroundColor: ctaBg, color: ctaText }}
                {...edit("headerCtaButton")}
              >
                {navLabel("navCtaBook")}
              </BookNowNavButton>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("contact-section")}
                className="mt-2 whitespace-nowrap rounded-full border border-white/30 bg-white/10 py-3 text-center text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 active:outline-none"
                style={{ color: ctaText }}
                {...edit("headerCtaButton")}
              >
                {navLabel("navCtaContact")}
              </button>
            )}
          </nav>
        </div>
        </>
      )}
    </>
  );
}
