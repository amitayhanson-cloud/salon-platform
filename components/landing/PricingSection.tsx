import Link from "next/link";
import { PRICING_SECTION } from "@/lib/landingContent";
import { PricingTierCards } from "./PricingTierCards";

export function PricingSection() {
  return (
    <section dir="rtl" id="pricing" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm md:p-8 lg:p-10">
          <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
            {PRICING_SECTION.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium leading-relaxed text-[#64748B] md:text-lg">
            {PRICING_SECTION.subtitle}
          </p>

          <PricingTierCards />

          <p className="mt-8 text-center text-sm text-[#64748B]">
            <Link
              href="/pricing"
              className="font-medium text-caleno-deep underline-offset-4 hover:text-caleno-ink hover:underline"
            >
              עמוד תמחור מלא — מדיניות ביטולים והחזרים והצהרות משפטיות
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
