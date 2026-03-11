"use client";

import { Inter } from "next/font/google";
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

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-landing-inter",
});

/**
 * Full Caleno SaaS landing page: header, all sections in order, footer.
 * Typography: Inter (weights 400/500/600), clean SaaS rhythm.
 */
export function LandingPage() {
  return (
    <div
      dir="ltr"
      className={`${inter.variable} ${inter.className} min-h-screen bg-white text-caleno-ink antialiased`}
    >
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
