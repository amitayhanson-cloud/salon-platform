"use client";

import Link from "next/link";
import Image from "next/image";

/** Marketing header: always logged-out UI. "התחברות" → /dashboard (then redirect to /login or tenant admin). */
export function Header() {
  return (
    <header className="border-b border-[#E2EEF2] bg-white sticky top-0 z-50 h-[72px]" dir="ltr">
      <nav className="container mx-auto px-4 h-full">
        <div className="flex items-center justify-between h-full">
          <Link
            href="/"
            className="text-xl font-semibold text-[#2EC4C6] hover:text-[#22A6A8] transition-colors flex items-center shrink-0 h-10 md:h-12"
          >
            <Image
              src="/brand/caleno logo/Untitled design.svg"
              alt="Caleno"
              width={160}
              height={48}
              className="h-10 md:h-12 w-auto object-contain"
              priority
            />
          </Link>
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            <Link
              href="#how-it-works"
              className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              איך זה עובד
            </Link>
            <Link
              href="#pricing"
              className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              מחירים
            </Link>
            <Link
              href="/dashboard"
              className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              התחברות
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-lg font-medium transition-colors"
            >
              הרשמה
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

