"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getLandingContent } from "@/lib/firestoreLanding";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landingContentDefaults";
import type { LandingContent } from "@/types/landingContent";
import { Accordion } from "@/components/admin/Accordion";
import FeaturesSection from "@/components/landing/FeaturesSection";

export default function Home() {
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [contentLoading, setContentLoading] = useState(true);
  const { user, firebaseUser, loading: authLoading } = useAuth();
  useEffect(() => {
    getLandingContent()
      .then(setContent)
      .catch(() => setContent(DEFAULT_LANDING_CONTENT))
      .finally(() => setContentLoading(false));
  }, []);

  const hero = content.hero;
  const about = content.about;
  const howSteps = content.how;
  const faqItems = content.faq;

  const isLoggedIn = !!(firebaseUser && user);
  const hasSite = !!(user?.siteId);

  const renderHeroCtas = () => {
    if (authLoading) {
      return (
        <>
          <div className="h-12 w-32 bg-slate-200 rounded-full animate-pulse" />
          <div className="h-12 w-24 bg-slate-200 rounded-full animate-pulse" />
        </>
      );
    }
    const heroPrimaryClass =
      "inline-block w-full sm:w-auto min-h-[44px] flex items-center justify-center px-8 py-3 text-base font-semibold bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-xl shadow-sm transition-colors text-center";
    const heroSecondaryClass =
      "inline-block w-full sm:w-auto min-h-[44px] flex items-center justify-center px-8 py-3 text-base rounded-xl bg-white border border-[#2EC4C6] text-[#2EC4C6] hover:bg-[#EEF7F9] font-medium transition-colors text-center";
    if (isLoggedIn && hasSite) {
      return (
        <Link href="/dashboard" className={heroPrimaryClass}>
          לדשבורד
        </Link>
      );
    }
    if (isLoggedIn && !hasSite) {
      return (
        <Link href="/signup" className={heroPrimaryClass}>
          {contentLoading ? DEFAULT_LANDING_CONTENT.hero.primaryCtaLabel : hero.primaryCtaLabel}
        </Link>
      );
    }
    return (
      <>
        <Link href="/signup" className={heroPrimaryClass}>
          {contentLoading ? DEFAULT_LANDING_CONTENT.hero.primaryCtaLabel : hero.primaryCtaLabel}
        </Link>
        <Link href="/dashboard" className={heroSecondaryClass}>
          התחברות
        </Link>
      </>
    );
  };

  return (
    <>
      {/* Hero — full viewport below header; background from layout (HeroBackground) */}
      <section className="relative min-h-[calc(100svh-72px)] flex flex-col items-center justify-center overflow-hidden">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-5 relative z-10">
          <div className="text-center" dir="rtl">
            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-[#0F172A] mb-4 sm:mb-6 leading-[1.15] tracking-tight max-w-4xl mx-auto whitespace-pre-line">
              {contentLoading ? DEFAULT_LANDING_CONTENT.hero.headline : hero.headline}
            </h1>
            <p className="mt-4 sm:mt-6 text-lg md:text-xl leading-relaxed text-slate-600 max-w-2xl mx-auto px-1">
              {contentLoading
                ? DEFAULT_LANDING_CONTENT.hero.subheadline
                : hero.subheadline}
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-sm sm:max-w-none mx-auto">
              {renderHeroCtas()}
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-6 flex justify-center z-10" dir="ltr">
          <a
            href="#about"
            className="scroll-indicator-btn cursor-pointer"
            aria-label="גלול למטה"
          >
            <span className="scroll-indicator-dot" />
          </a>
        </div>
      </section>

      {/* About / מי אנחנו */}
      <section
        id="about"
        className="bg-white/75 py-12 sm:py-16 md:py-20 border-t border-[#E2EEF2]"
      >
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="text-right mb-6 sm:mb-8 md:mb-12">
            <span className="inline-block h-1 w-10 rounded-full bg-[#2EC4C6] mb-3" />
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0F172A]">
              {about.title}
            </h2>
          </div>
          <div className="text-right space-y-4 text-[#475569] text-base sm:text-lg leading-relaxed max-w-3xl">
            {about.body.split(/\n\n+/).map((paragraph, i) => (
              <p key={i}>{paragraph.trim()}</p>
            ))}
            <p className="text-sm text-[#64748B]">{about.ownershipLine}</p>
          </div>
        </div>
      </section>

      {/* How it works / איך זה עובד — 3 steps */}
      <section
        id="how-it-works"
        className="bg-transparent py-12 sm:py-16 md:py-20 border-t border-[#E2EEF2]"
        dir="rtl"
      >
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0F172A] text-right mb-6 sm:mb-8 md:mb-12">
            איך זה עובד
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {howSteps.slice(0, 3).map((step, i) => (
              <div key={i} className="text-right">
                <div className="w-12 h-12 rounded-full bg-[#A7E6E7] text-[#22A6A8] flex items-center justify-center text-xl font-bold mb-4 flex-shrink-0">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold text-[#0F172A] mb-3">
                  {step.title}
                </h3>
                <p className="text-[#475569] text-sm md:text-base leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FeaturesSection />

      {/* FAQ / שאלות נפוצות */}
      <section
        id="faq"
        className="bg-white/75 py-12 sm:py-16 md:py-20 border-t border-[#E2EEF2]"
      >
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0F172A] text-right mb-6 sm:mb-8 md:mb-12">
            שאלות נפוצות
          </h2>
          <div className="space-y-3" dir="rtl">
            <Accordion
              items={faqItems.map((item, i) => ({
                id: `faq-${i}`,
                title: item.question,
                content: (
                  <p className="text-[#475569] text-sm md:text-base text-right">
                    {item.answer}
                  </p>
                ),
              }))}
            />
          </div>
        </div>
      </section>
    </>
  );
}
