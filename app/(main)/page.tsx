"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { routeAfterAuth } from "@/lib/authRedirect";
import { getAdminBasePath, isOnTenantSubdomainClient } from "@/lib/url";
import { getLandingContent } from "@/lib/firestoreLanding";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landingContentDefaults";
import type { LandingContent } from "@/types/landingContent";
import { Accordion } from "@/components/admin/Accordion";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [contentLoading, setContentLoading] = useState(true);

  useEffect(() => {
    getLandingContent()
      .then(setContent)
      .catch(() => setContent(DEFAULT_LANDING_CONTENT))
      .finally(() => setContentLoading(false));
  }, []);

  const handleGoToDashboard = async () => {
    if (!user) return;
    try {
      const redirectPath = await routeAfterAuth(user.id);
      const path =
        redirectPath.startsWith("/site/") && redirectPath.endsWith("/admin") && isOnTenantSubdomainClient()
          ? "/admin"
          : redirectPath;
      router.replace(path);
    } catch (error) {
      console.error("Error determining redirect path:", error);
      if (user.siteId) {
        router.replace(getAdminBasePath(user.siteId, isOnTenantSubdomainClient()));
      } else {
        router.replace("/builder");
      }
    }
  };

  const hero = content.hero;
  const about = content.about;
  const howSteps = content.how;
  const faqItems = content.faq;

  return (
    <>
      {/* Hero — background from layout (LandingBackground); only content here */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-white/[0.05] pointer-events-none z-[1]"
          aria-hidden
        />
        <div className="container mx-auto px-4 max-w-5xl relative z-10">
          <div className="text-center" dir="rtl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#0F172A] mb-6 leading-tight max-w-4xl mx-auto">
              {contentLoading ? DEFAULT_LANDING_CONTENT.hero.headline : hero.headline}
            </h1>
            <p className="text-base md:text-lg text-[#475569] mb-8 leading-relaxed max-w-2xl mx-auto">
              {contentLoading
                ? DEFAULT_LANDING_CONTENT.hero.subheadline
                : hero.subheadline}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              {user ? (
                <button
                  onClick={handleGoToDashboard}
                  disabled={loading}
                  className="inline-block px-6 py-3 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white font-semibold rounded-full shadow-sm transition-colors text-center disabled:opacity-50"
                >
                  {loading ? "טוען..." : "לדשבורד"}
                </button>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="inline-block px-6 py-3 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white font-semibold rounded-full shadow-sm transition-colors text-center"
                  >
                    {hero.primaryCtaLabel}
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="inline-block px-6 py-3 bg-white border border-[#2EC4C6] text-[#2EC4C6] hover:bg-[#EEF7F9] rounded-full font-medium transition-colors text-center"
                  >
                    {hero.secondaryCtaLabel}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* About / מי אנחנו */}
      <section
        id="about"
        className="bg-white/75 py-12 md:py-16 border-t border-[#E2EEF2]"
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-right mb-8 md:mb-12">
            <span className="inline-block h-1 w-10 rounded-full bg-[#2EC4C6] mb-3" />
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A]">
              {about.title}
            </h2>
          </div>
          <div className="text-right space-y-4 text-[#475569] text-base md:text-lg leading-relaxed max-w-3xl">
            <p>{about.body}</p>
            <p className="text-sm text-[#64748B]">{about.ownershipLine}</p>
          </div>
        </div>
      </section>

      {/* How it works / איך זה עובד — 3 steps */}
      <section
        id="how-it-works"
        className="bg-[#EEF7F9]/80 py-12 md:py-16 border-t border-[#E2EEF2]"
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] text-right mb-8 md:mb-12">
            איך זה עובד
          </h2>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {howSteps.slice(0, 3).map((step, i) => (
              <div key={i} className="text-right">
                <div className="w-12 h-12 rounded-full bg-[#A7E6E7] text-[#22A6A8] flex items-center justify-center text-xl font-bold mb-4">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold text-[#0F172A] mb-2">
                  {step.title}
                </h3>
                <p className="text-[#475569] text-sm md:text-base">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ / שאלות נפוצות */}
      <section
        id="faq"
        className="bg-white/75 py-12 md:py-16 border-t border-[#E2EEF2]"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] text-right mb-8 md:mb-12">
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
