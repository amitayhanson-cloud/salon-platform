import { Header } from "@/components/landing-v2/header";
import { HeroSection } from "@/components/landing-v2/hero-section";
import { StatsSection } from "@/components/landing-v2/stats-section";
import { ServicesSection } from "@/components/landing-v2/services-section";
import { FeaturesSection } from "@/components/landing-v2/features-section";
import { PricingSection } from "@/components/landing-v2/pricing-section";
import { TestimonialsSection } from "@/components/landing-v2/testimonials-section";
import { FAQSection } from "@/components/landing-v2/faq-section";
import { CTASection } from "@/components/landing-v2/cta-section";
import { Footer } from "@/components/landing-v2/footer";

export default function LandingV2Page() {
  return (
    <div className="landing-v2-root min-h-screen font-sans antialiased">
      <main className="min-h-screen bg-background">
        <Header />
        <HeroSection />
        <StatsSection />
        <ServicesSection />
        <FeaturesSection />
        <CTASection />
        <PricingSection />
        <TestimonialsSection />
        <FAQSection />
        <Footer />
      </main>
    </div>
  );
}
