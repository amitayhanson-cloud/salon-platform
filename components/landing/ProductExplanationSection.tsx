import Image from "next/image";
import { PRODUCT_EXPLANATION } from "@/lib/landingContent";
import { Check } from "lucide-react";

type ProductExplanationSectionProps = {
  /** When set, shown as product image instead of placeholder. */
  productImageUrl?: string | null;
};

export function ProductExplanationSection({ productImageUrl }: ProductExplanationSectionProps) {
  return (
    <section dir="rtl" id="product" className="bg-caleno-off py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* Image: second on mobile (order-2), first column on desktop (lg:order-1) */}
          <div className="order-2 mb-8 flex justify-center lg:order-1 lg:mb-0 lg:justify-start">
            <div
              className="h-72 w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white shadow-md overflow-hidden md:h-80"
              aria-hidden
            >
              {productImageUrl ? (
                <Image
                  src={productImageUrl}
                  alt=""
                  width={500}
                  height={320}
                  className="h-full w-full object-cover object-center"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  {PRODUCT_EXPLANATION.imagePlaceholder}
                </div>
              )}
            </div>
          </div>
          {/* Text: first on mobile (order-1), second column on desktop (lg:order-2) */}
          <div className="order-1 text-right lg:order-2">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
              {PRODUCT_EXPLANATION.title}
            </h2>
            <ul className="mt-6 space-y-4" role="list">
              {PRODUCT_EXPLANATION.bullets.map((bullet, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-caleno-mint/30 text-caleno-brand">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="max-w-[60ch] text-base font-normal leading-relaxed text-gray-500 md:text-lg">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
