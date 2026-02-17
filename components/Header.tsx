"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Marketing header (root domain). Shows auth-aware right side:
 * - On "/" when logged in: logo + user controls only (מחובר/ת כ־… + לדשבורד + התנתקות, no marketing nav / no החלף משתמש)
 * - On "/" when anonymous: איך זה עובד + מחירים + התחברות + הרשמה
 * - Mobile: Plus dropdown menu with nav + auth; desktop: inline nav
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
          className="text-xl font-semibold text-[#2EC4C6] hover:text-[#22A6A8] transition-colors flex items-center shrink-0 h-10 sm:h-12 md:h-14"
          onClick={closeMenu}
        >
          <Image
            src="/brand/caleno logo/caleno_logo_2.png"
            alt="Caleno"
            width={1852}
            height={777}
            sizes="(max-width: 640px) 95px, (max-width: 768px) 105px, 133px"
            className="h-10 sm:h-12 md:h-14 w-auto object-contain"
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

        {/* Mobile: Plus dropdown (replaces hamburger) */}
        <div className="relative md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[#2EC4C6] hover:bg-[#22A6A8] text-white shadow-md transition-colors -mr-2"
            aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
            aria-expanded={menuOpen}
          >
            <Menu className="w-6 h-6" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 md:hidden bg-black/20"
                  onClick={closeMenu}
                  aria-hidden
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{
                    duration: 0.2,
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  className="absolute top-full right-0 mt-2 z-50 min-w-[200px] rounded-xl bg-white border border-[#E2EEF2] shadow-lg overflow-hidden py-2"
                  dir="rtl"
                >
                  {!isLoggedInLanding && (
                    <>
                      <Link
                        href="#how-it-works"
                        onClick={closeMenu}
                        className="flex w-full items-center min-h-[44px] px-4 text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF7F9] transition-colors text-base"
                      >
                        איך זה עובד
                      </Link>
                      <Link
                        href="#pricing"
                        onClick={closeMenu}
                        className="flex w-full items-center min-h-[44px] px-4 text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF7F9] transition-colors text-base"
                      >
                        מחירים
                      </Link>
                      <div className="border-t border-[#E2EEF2] my-2" />
                    </>
                  )}
                  <div className="px-4 py-2">
                    <AuthStatus minimal={isLoggedInLanding} />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </nav>
    </header>
  );
}

