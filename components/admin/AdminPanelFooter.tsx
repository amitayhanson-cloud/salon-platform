"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * Caleno attribution at the bottom of tenant admin pages.
 */
export function AdminPanelFooter() {
  return (
    <footer
      className="mt-16 border-t border-slate-200/70 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8"
      dir="rtl"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="https://caleno.co"
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6F7C] focus-visible:ring-offset-2 rounded-md"
          aria-label="Caleno — לאתר"
        >
          <span className="relative mx-auto block h-7 w-[118px] sm:h-8 sm:w-[136px]">
            <Image
              src="/brand/caleno logo/caleno_logo_new.png"
              alt="Caleno"
              fill
              className="object-contain object-center"
              sizes="136px"
            />
          </span>
        </Link>
        <p className="text-center text-xs text-slate-400">נבנה ומופעל באמצעות Caleno</p>
      </div>
    </footer>
  );
}
