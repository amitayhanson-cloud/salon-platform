"use client";

import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { TrustSection } from "./TrustSection";
import { ProductExplanationSection } from "./ProductExplanationSection";
import { LandingFeaturesGrid } from "./LandingFeaturesGrid";
import { ProductDemoSection } from "./ProductDemoSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { PricingSection } from "./PricingSection";
import { ContactSection } from "./ContactSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { LandingFooter } from "./LandingFooter";

/**
 * Full Caleno SaaS landing page: header, all sections in order, footer.
 * Uses neutral gray theme; section ids match nav anchors.
 */
export function LandingPage() {
  return (
    <div dir="ltr" className="min-h-screen bg-white text-gray-900">
      <LandingHeader />
      <main>
        <LandingHero />
        <TrustSection />
        <ProductExplanationSection />
        <LandingFeaturesGrid />
        <ProductDemoSection />
        <HowItWorksSection />
        <PricingSection />
        <ContactSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
