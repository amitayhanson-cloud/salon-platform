import { PRODUCT_EXPLANATION } from "@/lib/landingContent";
import { Check } from "lucide-react";

export function ProductExplanationSection() {
  return (
    <section dir="rtl" id="product" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* RTL desktop: text left (order-2), image right (order-1) */}
          <div className="mb-8 flex justify-center lg:order-1 lg:mb-0 lg:justify-start">
            <div
              className="h-72 w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white shadow-md md:h-80"
              aria-hidden
            >
              <div className="flex h-full items-center justify-center text-gray-400">
                {PRODUCT_EXPLANATION.imagePlaceholder}
              </div>
            </div>
          </div>
          <div className="text-right lg:order-2">
            <h2 className="text-2xl font-bold tracking-tight text-caleno-ink md:text-3xl">
              {PRODUCT_EXPLANATION.title}
            </h2>
            <ul className="mt-6 space-y-4" role="list">
              {PRODUCT_EXPLANATION.bullets.map((bullet, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-caleno-mint/30 text-caleno-brand">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="max-w-[60ch] text-base text-gray-500 md:text-lg">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
