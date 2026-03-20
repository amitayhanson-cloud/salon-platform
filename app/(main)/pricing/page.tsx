import type { Metadata } from "next";
import Link from "next/link";
import {
  PRICING_PAGE,
  PRICING_RETURN_POLICY,
  PRICING_DISCLAIMER,
} from "@/lib/landingContent";
import { PricingTierCards } from "@/components/landing/PricingTierCards";

export const metadata: Metadata = {
  title: "תמחור ומנויים | Caleno",
  description:
    "חבילות מנוי קלינו, מדיניות ביטולים והחזרים והבהרות משפטיות לפני רכישה.",
};

export default function PricingPage() {
  return (
    <div
      className="relative min-h-screen pb-16 text-caleno-ink antialiased"
      dir="rtl"
    >
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 100% 100% at 50% 50%, #cceef1 0%, #e6f5f7 25%, #f0f9fa 50%, #f8fcfd 75%, #ffffff 100%)",
        }}
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-block text-sm font-medium text-caleno-deep transition hover:text-caleno-ink"
        >
          ← חזרה לדף הבית
        </Link>

        <header className="text-right">
          <h1 className="text-3xl font-bold tracking-tight text-caleno-ink md:text-4xl">
            {PRICING_PAGE.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-[#64748B] md:text-lg">
            {PRICING_PAGE.intro}
          </p>
        </header>

        <div className="mt-10 overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm md:p-10">
          <PricingTierCards />
        </div>

        <section className="mt-14 max-w-3xl rounded-2xl border border-[#E2E8F0] bg-white/90 p-6 text-right shadow-sm md:p-8">
          <h2 className="text-xl font-semibold text-caleno-ink">
            {PRICING_RETURN_POLICY.title}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#475569] md:text-base">
            {PRICING_RETURN_POLICY.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        <section className="mt-8 max-w-3xl rounded-2xl border border-amber-200/80 bg-amber-50/40 p-6 text-right shadow-sm md:p-8">
          <h2 className="text-xl font-semibold text-caleno-ink">
            {PRICING_DISCLAIMER.title}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#57534E] md:text-base">
            {PRICING_DISCLAIMER.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-sm text-[#64748B]">
          לשאלות לפני תשלום:{" "}
          <Link
            href="/#contact"
            className="font-medium text-caleno-deep underline-offset-4 hover:underline"
          >
            צור קשר
          </Link>
          {" · "}
          <Link
            href="/terms"
            className="font-medium text-caleno-deep underline-offset-4 hover:underline"
          >
            תנאי שימוש
          </Link>
          {" · "}
          <Link
            href="/privacy"
            className="font-medium text-caleno-deep underline-offset-4 hover:underline"
          >
            מדיניות פרטיות
          </Link>
        </p>
      </div>
    </div>
  );
}
