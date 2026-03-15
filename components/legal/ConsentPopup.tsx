"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const STORAGE_KEY = "caleno_terms_privacy_agreed";

/** Paths where we hide the popup so the user can read the legal text; they still must agree to use the rest of the site. */
const LEGAL_PATHS = ["/privacy", "/terms"];

export function ConsentPopup() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [agreed, setAgreed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setAgreed(!!stored);
    } catch {
      setAgreed(false);
    }
  }, []);

  const handleAgree = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      setAgreed(true);
    } catch {
      setAgreed(true);
    }
  };

  /* Only show terms/privacy consent after user has logged in, not on the public landing page. */
  if (!user) return null;
  if (agreed === null) return null;
  if (agreed) return null;
  /* On legal pages, hide the popup so the user can read; popup will show again on any other page until they agree. */
  if (pathname && LEGAL_PATHS.includes(pathname)) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl md:p-8"
        dir="rtl"
      >
        <div className="mb-6 flex justify-center">
          <div className="relative h-12 w-40 md:h-14 md:w-48">
            <Image
              src="/brand/caleno logo/caleno_logo_new.png"
              alt="Caleno"
              fill
              className="object-contain object-center"
              priority
              sizes="192px"
            />
          </div>
        </div>
        <h2 id="consent-title" className="text-center text-lg font-bold text-slate-900 md:text-xl">
          ברוך הבא לקלינו
        </h2>
        <p className="mt-3 text-center text-sm leading-relaxed text-slate-600 md:text-base">
          כדי להמשיך בשימוש באתר, יש לאשר את מדיניות הפרטיות ואת תנאי השימוש.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
          <Link
            href="/privacy"
            className="text-caleno-deep underline decoration-caleno-deep/50 underline-offset-2 hover:decoration-caleno-deep"
          >
            מדיניות פרטיות
          </Link>
          <Link
            href="/terms"
            className="text-caleno-deep underline decoration-caleno-deep/50 underline-offset-2 hover:decoration-caleno-deep"
          >
            תנאי שימוש
          </Link>
        </div>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={handleAgree}
            className="rounded-xl bg-caleno-ink px-8 py-3 text-base font-semibold text-white shadow-md transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-caleno-deep focus:ring-offset-2"
          >
            אני מסכים
          </button>
        </div>
      </div>
    </div>
  );
}
