"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { HEADER_CTA, NAV_LINKS } from "@/lib/landingContent";

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 border-b border-gray-200 bg-white backdrop-blur-sm md:bg-white/95"
      role="banner"
    >
      {/* Mobile: flex — logo left, hamburger right (order-2, order-1). Desktop: 3-column grid. */}
      <nav
        aria-label="ניווט ראשי"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:grid md:h-16 md:px-6 md:[grid-template-columns:auto_1fr_auto] lg:px-8"
      >
        {/* A. Logo — left on mobile (order-2), right on desktop */}
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

        {/* B. Nav links — hidden on mobile, centered on desktop */}
        <div className="hidden min-w-0 md:flex md:justify-center md:gap-8">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium leading-normal text-caleno-ink hover:text-caleno-deep shrink-0"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* C. Actions — hamburger on mobile (right via order-1), login+CTA on desktop */}
        <div className="order-1 flex shrink-0 items-center gap-4 md:order-none md:justify-self-end">
          <div className="hidden md:flex md:items-center md:gap-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium leading-normal text-[#0F172A] transition-colors hover:border-[#1E6F7C]/40 hover:bg-[#F8FAFC] hover:text-[#1E6F7C]"
            >
              התחברות
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-medium leading-normal text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:-translate-y-px hover:shadow-md active:translate-y-0"
            >
              {HEADER_CTA}
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
      </nav>

      {/* Mobile menu: slide-down, smooth animation */}
      <div
        id="mobile-nav-menu"
        className="overflow-hidden transition-[max-height] duration-300 ease-out md:hidden"
        style={{ maxHeight: mobileOpen ? "400px" : "0" }}
        role="dialog"
        aria-label="תפריט ניווט"
        aria-hidden={!mobileOpen}
      >
        <div className="border-t border-gray-200 bg-white px-4 py-4">
          <nav className="flex flex-col gap-1" aria-label="ניווט מובייל">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-3 text-right text-sm font-medium leading-relaxed text-caleno-ink hover:bg-caleno-off focus-visible:bg-caleno-off focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
              <Link
                href="/login"
                className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-center text-sm font-medium leading-relaxed text-[#0F172A] hover:bg-[#F8FAFC] hover:text-[#1E6F7C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                onClick={() => setMobileOpen(false)}
              >
                התחברות
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-[#0F172A] px-5 py-3 text-sm font-medium leading-normal text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
                onClick={() => setMobileOpen(false)}
              >
                {HEADER_CTA}
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
