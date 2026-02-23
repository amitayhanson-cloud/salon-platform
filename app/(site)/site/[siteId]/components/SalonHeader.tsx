"use client";

import { useState } from "react";
import Link from "next/link";
import { getSiteUrl } from "@/lib/tenant";
import { DEFAULT_CONTENT } from "@/lib/editor/defaultContent";
import type { SiteContent } from "@/types/siteConfig";

const NAV_IDS = [
  { key: "navAbout", id: "about-section" },
  { key: "navServices", id: "services-section" },
  { key: "navGallery", id: "gallery-section" },
] as const;

const LOGO_HEIGHT = 44; // prominent in header (h-16)

const EDITOR_ATTRS = {
  headerBg: {
    "data-edit-id": "headerBg",
    "data-edit-kind": "color",
    "data-edit-paths": '["sectionStyles.header.bg"]',
    "data-edit-label": "רקע כותרת",
  },
  headerText: {
    "data-edit-id": "headerText",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.brandName","sectionStyles.header.text"]',
    "data-edit-label": "שם הסלון בכותרת",
  },
  headerNavAbout: {
    "data-edit-id": "headerNavLink",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.navAbout","sectionStyles.header.link"]',
    "data-edit-label": "קישור אודות",
  },
  headerNavServices: {
    "data-edit-id": "headerNavLink",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.navServices","sectionStyles.header.link"]',
    "data-edit-label": "קישור שירותים",
  },
  headerNavGallery: {
    "data-edit-id": "headerNavLink",
    "data-edit-kind": "text",
    "data-edit-paths": '["content.header.navGallery","sectionStyles.header.link"]',
    "data-edit-label": "קישור גלריה",
  },
  headerCtaButton: {
    "data-edit-id": "headerCtaButton",
    "data-edit-kind": "button",
    "data-edit-paths": '["content.header.navCtaBook","content.header.navCtaContact","sectionStyles.header.primaryBtnBg","sectionStyles.header.primaryBtnText"]',
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
}: {
  salonName: string;
  siteId: string;
  slug?: string | null;
  bookingEnabled: boolean;
  scrollToSection: (id: string) => void;
  logoUrl?: string | null;
  logoAlt?: string;
  editorMode?: boolean;
  /** Section-scoped header colors (override themeColors for this section only) */
  headerBg?: string;
  headerText?: string;
  headerLink?: string;
  headerCtaBg?: string;
  headerCtaText?: string;
  /** Editable text content for header (nav labels, CTA text) */
  contentHeader?: SiteContent["header"];
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const edit = editorMode ? (key: keyof typeof EDITOR_ATTRS) => EDITOR_ATTRS[key] : () => ({});

  const navLabel = (key: keyof NonNullable<SiteContent["header"]>) =>
    contentHeader?.[key]?.trim() ? contentHeader[key]! : DEFAULT_CONTENT.header[key];

  const handleNavClick = (id: string) => {
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  const bgColor = headerBg ?? "rgba(0,0,0,0.5)";
  const textColor = headerText ?? "#ffffff";
  const linkColor = headerLink ?? "rgba(255,255,255,0.9)";
  const ctaBg = headerCtaBg ?? "var(--primary)";
  const ctaText = headerCtaText ?? "var(--primaryText)";

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-20 w-full text-right transition-[background,backdrop-filter]"
      style={{
        backgroundColor: bgColor,
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
      }}
      {...edit("headerBg")}
    >
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-3 items-center gap-4 px-4 lg:px-8">
        {/* Col 1 in RTL = right: salon name */}
        <div className="flex min-w-0 items-center justify-start" {...edit("headerText")}>
          <span
            dir="ltr"
            lang="en"
            className="text-xl font-semibold tracking-wide"
            style={{ unicodeBidi: "isolate", color: textColor }}
          >
            {salonName}
          </span>
        </div>

        {/* Col 2 = center: nav (desktop) or hamburger (mobile) */}
        <div className="flex items-center justify-center">
          <nav className="hidden items-center gap-8 md:flex" aria-label="ניווט ראשי">
            {NAV_IDS.map(({ key, id }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavClick(id)}
                className="text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent"
                style={{ color: linkColor }}
                {...edit(key === "navAbout" ? "headerNavAbout" : key === "navServices" ? "headerNavServices" : "headerNavGallery")}
              >
                {navLabel(key)}
              </button>
            ))}
            {isBookingEnabled ? (
              <Link
                href={getSiteUrl(slug, siteId, "/book")}
                className="rounded-full px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent"
                style={{ backgroundColor: ctaBg, color: ctaText }}
                {...edit("headerCtaButton")}
              >
                {navLabel("navCtaBook")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("contact-section")}
                className="rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent"
                style={{ color: ctaText }}
                {...edit("headerCtaButton")}
              >
                {navLabel("navCtaContact")}
              </button>
            )}
          </nav>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/50 md:hidden"
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
        </div>

        {/* Col 3 in RTL = left: logo only */}
        <div className="flex min-w-0 items-center justify-end">
          {logoUrl ? (
            <Link
              href={getSiteUrl(slug, siteId, "")}
              className="flex shrink-0 items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
              style={{ height: LOGO_HEIGHT }}
              aria-label={logoAlt || salonName || "דף הבית"}
            >
              <img
                src={logoUrl}
                alt={logoAlt || salonName || "לוגו"}
                className="h-full w-auto object-contain"
                style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
              />
            </Link>
          ) : (
            <span className="w-0" aria-hidden />
          )}
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div
          className="absolute left-0 right-0 top-16 border-t border-white/10 bg-black/90 px-4 py-4 shadow-lg md:hidden"
          style={{ backdropFilter: "saturate(180%) blur(12px)" }}
        >
          {logoUrl ? (
            <Link
              href={getSiteUrl(slug, siteId, "")}
              onClick={() => setMobileMenuOpen(false)}
              className="flex justify-center py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
              style={{ height: LOGO_HEIGHT }}
              aria-label={logoAlt || salonName || "דף הבית"}
            >
              <img
                src={logoUrl}
                alt={logoAlt || salonName || "לוגו"}
                className="h-full w-auto object-contain"
                style={{ height: LOGO_HEIGHT, maxHeight: LOGO_HEIGHT }}
              />
            </Link>
          ) : null}
          <nav className="flex flex-col gap-1" aria-label="ניווט ראשי (נייד)">
            {NAV_IDS.map(({ key, id }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavClick(id)}
                className="rounded-lg py-3 text-right text-base font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
                style={{ color: linkColor }}
                {...edit(key === "navAbout" ? "headerNavAbout" : key === "navServices" ? "headerNavServices" : "headerNavGallery")}
              >
                {navLabel(key)}
              </button>
            ))}
            {isBookingEnabled ? (
              <Link
                href={getSiteUrl(slug, siteId, "/book")}
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 rounded-full px-5 py-3 text-center text-sm font-semibold"
                style={{ backgroundColor: ctaBg, color: ctaText }}
                {...edit("headerCtaButton")}
              >
                {navLabel("navCtaBook")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("contact-section")}
                className="mt-2 rounded-full border border-white/30 bg-white/10 py-3 text-center text-sm font-semibold"
                style={{ color: ctaText }}
                {...edit("headerCtaButton")}
              >
                {navLabel("navCtaContact")}
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
