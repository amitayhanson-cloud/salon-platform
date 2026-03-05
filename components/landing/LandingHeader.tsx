"use client";

import Link from "next/link";
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
      <nav
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:h-16 md:px-6 lg:px-8"
        aria-label="ניווט ראשי"
      >
        <Link
          href="/"
          className="text-xl font-semibold text-caleno-ink hover:text-caleno-deep"
        >
          Caleno
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-caleno-ink hover:text-caleno-deep"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-xl bg-caleno-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1F2937] hover:-translate-y-px hover:shadow-md active:translate-y-0"
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
      </nav>

      {mobileOpen && (
        <div
          id="mobile-nav-menu"
          className="border-t border-gray-200 bg-white px-4 py-4 md:hidden"
          role="dialog"
          aria-label="תפריט ניווט"
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-caleno-ink hover:bg-caleno-off focus-visible:bg-caleno-off focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/signup"
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-caleno-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1F2937] hover:-translate-y-px hover:shadow-md active:translate-y-0 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
              onClick={() => setMobileOpen(false)}
            >
              {HEADER_CTA}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
