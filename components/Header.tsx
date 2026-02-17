"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Marketing header (root domain). Shows auth-aware right side:
 * - On "/" when logged in: logo + user controls only (מחובר/ת כ־… + לדשבורד + התנתקות, no marketing nav / no החלף משתמש)
 * - On "/" when anonymous: איך זה עובד + מחירים + התחברות + הרשמה
 * - Mobile: hamburger menu with nav + auth; desktop: inline nav
 */
export function Header() {
  const pathname = usePathname();
  const { user, firebaseUser } = useAuth();
  const isLoggedInLanding = pathname === "/" && !!(user || firebaseUser);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="border-b border-[#E2EEF2] bg-[#d9f3f2] sticky top-0 z-50" dir="ltr">
      <nav className="max-w-6xl mx-auto w-full px-4 sm:px-6 h-14 sm:h-[72px] flex items-center justify-between">
        <Link
          href="/"
          className="text-xl font-semibold text-[#2EC4C6] hover:text-[#22A6A8] transition-colors flex items-center shrink-0 h-10 sm:h-11 md:h-14"
          onClick={closeMenu}
        >
          <Image
            src="/brand/caleno logo/Untitled design.svg"
            alt="Caleno"
            width={192}
            height={56}
            className="h-10 sm:h-11 md:h-14 w-auto object-contain"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4 lg:gap-6 flex-wrap">
          {!isLoggedInLanding && (
            <>
              <Link
                href="#how-it-works"
                className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors min-h-[44px] flex items-center"
              >
                איך זה עובד
              </Link>
              <Link
                href="#pricing"
                className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors min-h-[44px] flex items-center"
              >
                מחירים
              </Link>
            </>
          )}
          <AuthStatus minimal={isLoggedInLanding} />
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[#475569] hover:text-[#0F172A] transition-colors rounded-lg -mr-2"
          aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile menu panel */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 top-14 sm:top-[72px] md:hidden"
            onClick={closeMenu}
            aria-hidden
          />
          <div
            className="fixed right-0 top-14 sm:top-[72px] bottom-0 w-full max-w-sm bg-[#d9f3f2] border-l border-[#E2EEF2] z-50 shadow-xl md:hidden overflow-y-auto"
            dir="rtl"
          >
            <div className="flex flex-col p-4 gap-1">
              {!isLoggedInLanding && (
                <>
                  <Link
                    href="#how-it-works"
                    onClick={closeMenu}
                    className="min-h-[44px] flex items-center px-4 text-[#475569] hover:text-[#0F172A] hover:bg-[#c5eeed] rounded-lg transition-colors text-lg"
                  >
                    איך זה עובד
                  </Link>
                  <Link
                    href="#pricing"
                    onClick={closeMenu}
                    className="min-h-[44px] flex items-center px-4 text-[#475569] hover:text-[#0F172A] hover:bg-[#c5eeed] rounded-lg transition-colors text-lg"
                  >
                    מחירים
                  </Link>
                </>
              )}
              <div className="min-h-[44px] flex items-center px-4 pt-2 border-t border-[#E2EEF2] mt-2">
                <AuthStatus minimal={isLoggedInLanding} />
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

