"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEADER_CTA, NAV_LINKS } from "@/lib/landingContent";

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header dir="rtl" className="sticky top-2 z-50 md:top-4" role="banner">
      {/* Pill navbar — match template: mt-2, py-2, bg-white/70, rounded-full, CTA with inset shadow */}
      <nav
        aria-label="ניווט ראשי"
        className={cn(
          "mt-2 flex items-center justify-between gap-3 rounded-full border border-[#E2E8F0] bg-white/70 px-4 py-2 shadow-sm backdrop-blur-md md:grid md:px-6 md:[grid-template-columns:auto_1fr_auto]",
        )}
      >
        {/* A. Actions — first in DOM so in RTL grid they appear on the right; hamburger on mobile (order-1) */}
        <div className="order-1 flex shrink-0 items-center gap-2 md:order-none md:justify-self-end">
          <div className="hidden md:flex md:items-center md:gap-2">
            <Link
              href="/login"
              className="text-sm text-[#64748B] transition-colors hover:text-[#0F172A]"
            >
              התחברות
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,.15)] transition-colors hover:bg-neutral-800"
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

        {/* B. Nav links — hidden on mobile, centered on desktop (template: text-muted hover:foreground) */}
        <div className="hidden min-w-0 md:flex md:justify-center md:gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 text-sm text-[#64748B] transition-colors hover:text-[#0F172A]"
            >
              {label}
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
