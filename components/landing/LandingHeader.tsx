"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/lib/landingContent";

const navLinkLine =
  "relative inline-block pb-1 text-sm text-[#64748B] transition-colors duration-300 group-hover:text-[#0F172A] after:absolute after:bottom-0 after:right-0 after:block after:h-[2px] after:w-0 after:rounded-full after:bg-[#1E6F7C] after:transition-[width] after:duration-300 after:ease-out group-hover:after:w-full after:content-['']";

const navLinkPill =
  "group shrink-0 rounded-full px-3 py-1.5 text-sm transition-[background-color,box-shadow] duration-300 ease-out hover:bg-caleno-100/80 hover:shadow-[0_2px_14px_-4px_rgba(9,137,155,0.14)] active:bg-caleno-100";

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 w-full bg-transparent py-1.5 md:py-2"
      role="banner"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-0 px-4 lg:px-8">
        {/* Pill navbar — full-width bar, nav content centered in max-w-6xl */}
        <nav
          aria-label="ניווט ראשי"
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-full border border-white/30 bg-white/25 px-4 py-2 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(255,255,255,0.4)_inset] backdrop-blur-xl md:grid md:px-6 md:[grid-template-columns:auto_1fr_auto]",
          )}
        >
        {/* A. Actions — first in DOM so in RTL grid they appear on the right; hamburger on mobile (order-1) */}
        <div className="order-1 flex shrink-0 items-center gap-2 md:order-none md:justify-self-end">
          <div className="hidden md:flex md:items-center md:gap-2">
            <Link
              href="/waitlist"
              className="inline-flex items-center justify-center rounded-full border border-caleno-200/50 bg-caleno-50/40 px-4 py-2 text-sm font-medium text-[#0F172A] transition-[background-color,box-shadow,border-color] duration-300 hover:border-caleno-200 hover:bg-caleno-100/90 hover:shadow-[0_2px_16px_-4px_rgba(9,137,155,0.16)]"
            >
              הצטרפו לרשימת ההמתנה
            </Link>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-caleno-ink hover:bg-caleno-off focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "סגור תפריט" : "פתח תפריט"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* B. Nav links — hidden on mobile, centered on desktop (template: text-muted hover:foreground) */}
        <div className="hidden min-w-0 md:flex md:justify-center md:gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className={navLinkPill}>
              <span className={navLinkLine}>{label}</span>
            </Link>
          ))}
        </div>

        {/* C. Logo — last in DOM so in RTL grid it appears on the left; on mobile order-2 so logo is left, hamburger right */}
        <div className="order-2 flex shrink-0 md:order-none md:justify-self-start">
          <Link
            href="/"
            className="relative flex shrink-0 items-center py-1 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2 rounded"
            aria-label="Caleno – דף הבית"
          >
            <span className="relative block h-9 w-[140px] shrink-0 md:h-11 md:min-w-[180px] md:w-[205px]">
              <Image
                src="/brand/caleno logo/caleno_logo_new.png"
                alt="Caleno"
                fill
                className="object-contain object-left"
                priority
                sizes="(max-width: 768px) 140px, 205px"
              />
            </span>
          </Link>
        </div>
        </nav>

        {/* Mobile menu: slide-down, same width as nav */}
        <div
        id="mobile-nav-menu"
        className="overflow-hidden transition-[max-height] duration-300 ease-out md:hidden"
        style={{ maxHeight: mobileOpen ? "400px" : "0" }}
        role="dialog"
        aria-label="תפריט ניווט"
        aria-hidden={!mobileOpen}
      >
        <div className="mt-2 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-4 shadow-sm">
          <nav className="flex flex-col gap-1" aria-label="ניווט מובייל">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="group flex justify-end rounded-full px-3 py-2.5 text-sm font-medium leading-relaxed text-caleno-ink transition-[background-color,box-shadow] duration-300 hover:bg-caleno-100/75 hover:shadow-[inset_0_0_0_1px_rgba(153,221,227,0.35)] focus-visible:bg-caleno-off focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                onClick={() => setMobileOpen(false)}
              >
                <span className={navLinkLine}>{label}</span>
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
              <Link
                href="/waitlist"
                className="inline-flex items-center justify-center rounded-full bg-caleno-800 px-5 py-3 text-sm font-medium leading-normal text-white shadow-sm transition-[background-color,box-shadow] duration-300 hover:bg-caleno-700 hover:shadow-[0_4px_18px_-4px_rgba(15,69,80,0.3)] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-caleno-300 focus-visible:ring-offset-2"
                onClick={() => setMobileOpen(false)}
              >
                הצטרפו לרשימת ההמתנה
              </Link>
            </div>
          </nav>
        </div>
        </div>
      </div>
    </header>
  );
}
