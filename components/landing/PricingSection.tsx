import Link from "next/link";
import { Check } from "lucide-react";
import { PRICING_SECTION, PRICING_TIERS } from "@/lib/landingContent";

export function PricingSection() {
  return (
    <section
      dir="rtl"
      id="pricing"
      className="border-t border-gray-200 bg-gray-50 py-12 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-[clamp(24px,4vw,40px)] font-bold leading-tight tracking-tight text-gray-900">
          {PRICING_SECTION.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[clamp(14px,2.2vw,18px)] text-slate-600">
          {PRICING_SECTION.subtitle}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {PRICING_TIERS.map((tier) => (
            <article
              key={tier.id}
              className={`relative mx-auto flex w-full max-w-[420px] flex-col rounded-2xl border bg-white p-6 shadow-sm md:mx-0 md:max-w-none md:p-8 ${
                tier.highlighted
                  ? "border-gray-900 ring-2 ring-gray-900"
                  : "border-gray-200"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                  {PRICING_SECTION.badge}
                </div>
              )}
              <h3 className="text-right text-lg font-semibold text-gray-900">
                {tier.name}
              </h3>
              <p className="mt-1 text-right text-sm text-gray-600">
                {tier.description}
              </p>
              <div className="mt-4 flex items-baseline justify-end gap-1">
                <span className="text-3xl font-bold tracking-tight text-gray-900">
                  ${tier.price}
                </span>
                <span className="text-gray-500">{tier.period}</span>
              </div>
              <ul className="mt-6 space-y-3 text-right" role="list">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                    <Check className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={
                  tier.highlighted
                    ? "mt-8 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold md:w-auto bg-gray-900 text-white hover:bg-gray-800"
                    : "mt-8 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold md:w-auto border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }
              >
                {PRICING_SECTION.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
