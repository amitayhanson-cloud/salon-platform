"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  hasValidCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookieConsent";

const HIDDEN_PATHS = new Set(["/privacy", "/terms", "/cookies"]);

export function PublicCookieBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShow(!hasValidCookieConsent());
  }, []);

  const handleChoice = (choice: CookieConsentChoice) => {
    setCookieConsent(choice);
    setShow(false);
  };

  if (show == null || !show) return null;
  if (pathname && HIDDEN_PATHS.has(pathname)) return null;

  return (
    <div
      role="dialog"
      aria-label="הסכמה לשימוש בעוגיות"
      className="fixed bottom-0 left-0 right-0 z-[9998] border-t border-gray-200 bg-white/98 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm"
      dir="rtl"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-gray-700">
            אנחנו משתמשים בעוגיות כדי להפעיל את האתר, לזכור העדפות ולשפר ביצועים. לפרטים נוספים ראו{" "}
            <Link
              href="/cookies"
              className="font-medium text-caleno-deep underline decoration-caleno-deep/50 underline-offset-2 hover:decoration-caleno-deep"
            >
              מדיניות עוגיות
            </Link>{" "}
            ו-
            <Link
              href="/privacy"
              className="font-medium text-caleno-deep underline decoration-caleno-deep/50 underline-offset-2 hover:decoration-caleno-deep"
            >
              מדיניות הפרטיות
            </Link>
            .
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => handleChoice("essential")}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-caleno-deep focus:ring-offset-2"
            >
              רק הכרחיות
            </button>
            <button
              type="button"
              onClick={() => handleChoice("accepted")}
              className="rounded-lg bg-caleno-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-caleno-deep focus:ring-offset-2"
            >
              מאשר/ת הכל
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
