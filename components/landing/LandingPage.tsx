"use client";

import { useState, useEffect } from "react";
import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { ProductExplanationSection } from "./ProductExplanationSection";
import { LandingFeaturesGrid } from "./LandingFeaturesGrid";
import { ProductDemoSection } from "./ProductDemoSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { PricingSection } from "./PricingSection";
import { ContactSection } from "./ContactSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { LandingFooter } from "./LandingFooter";
import { LandingPageBackground } from "./LandingPageBackground";
import type { LandingContent } from "@/types/landingContent";

/**
 * Full Caleno SaaS landing page: header, all sections in order, footer.
 * Loads landing content (including image URLs) from API for dynamic hero/section images.
 */
export function LandingPage() {
  const [content, setContent] = useState<LandingContent | null>(null);

  useEffect(() => {
    const url = "/api/landing-content?t=" + Date.now();
    fetch(url, { cache: "no-store", headers: { Pragma: "no-cache" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setContent(data))
      .catch(() => {});
  }, []);

  return (
    <>
      <LandingPageBackground />

      {/* Navbar: full-width, sticky for entire page (unchanged) */}
      <LandingHeader />

      {/* Top block: hero + Caleno box */}
      <div className="relative">
        <div className="mx-auto max-w-6xl px-4 py-3 md:py-4 lg:px-8">
          <LandingHero />
        </div>
      </div>

      <main className="relative">
        <ProductExplanationSection productImageUrl={content?.features?.websitePreviewImageUrl} />
        <LandingFeaturesGrid />
        <ProductDemoSection
          calendarImageUrl={content?.features?.calendarImageUrl}
          clientsImageUrl={content?.features?.clientsImageUrl}
          whatsappImageUrl={content?.features?.whatsappImageUrl}
        />
        <HowItWorksSection />
        <PricingSection />
        <ContactSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </>
  );
}
