"use client";

import { useState, useEffect } from "react";
import { Inter } from "next/font/google";
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

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-landing-inter",
});

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
    <div
      dir="ltr"
      className={`${inter.variable} ${inter.className} min-h-screen bg-white text-caleno-ink antialiased`}
    >
      <LandingHeader />
      <main>
        <LandingHero heroImageUrl={content?.hero?.imageUrl} />
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
    </div>
  );
}
