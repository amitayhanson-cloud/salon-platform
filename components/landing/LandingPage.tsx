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
      {/* Stationary gradient: Caleno at center spreading out, white at edges; fixed so content scrolls on top */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 100% 100% at 50% 50%, #cceef1 0%, #e6f5f7 25%, #f0f9fa 50%, #f8fcfd 75%, #ffffff 100%)
          `,
        }}
      />

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
