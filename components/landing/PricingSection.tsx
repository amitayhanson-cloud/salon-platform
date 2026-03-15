import Link from "next/link";
import { Check } from "lucide-react";
import { PRICING_SECTION, PRICING_TIERS } from "@/lib/landingContent";

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

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {PRICING_TIERS.map((tier) => (
              <article
                key={tier.id}
                className={`relative mx-auto flex w-full max-w-[420px] flex-col rounded-2xl border p-6 shadow-sm md:mx-0 md:max-w-none md:p-8 ${
                  tier.highlighted
                    ? "border-caleno-deep bg-caleno-off/30 ring-2 ring-caleno-deep/30"
                    : "border-[#E2E8F0] bg-caleno-off/20"
                }`}
              >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-caleno-deep px-3 py-1 text-xs font-semibold leading-tight text-white">
                  {PRICING_SECTION.badge}
                </div>
              )}
              <h3 className="text-right text-lg font-semibold leading-tight text-caleno-ink">
                {tier.name}
              </h3>
              <p className="mt-1 text-right text-sm font-normal leading-relaxed text-[#64748B]">
                {tier.description}
              </p>
              <ul className="mt-6 space-y-3 text-right" role="list">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-normal leading-relaxed text-[#64748B]">
                    <Check className="h-5 w-5 shrink-0 text-caleno-brand" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={
                  tier.highlighted
                    ? "mt-8 inline-flex w-full items-center justify-center rounded-full bg-caleno-deep px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-caleno-600 md:w-auto"
                    : "mt-8 inline-flex w-full items-center justify-center rounded-full border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-medium text-caleno-ink transition-colors hover:bg-caleno-off md:w-auto"
                }
              >
                {PRICING_SECTION.cta}
              </Link>
            </article>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}
