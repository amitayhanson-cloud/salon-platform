import Link from "next/link";
import { HERO } from "@/lib/landingContent";

const HERO_HEADLINE_END = "במקום אחד";

export function LandingHero() {
  const headline = HERO.headline;
  const highlightEnd = headline.endsWith(HERO_HEADLINE_END);
  const headlineRest = highlightEnd ? headline.slice(0, -HERO_HEADLINE_END.length) : headline;
  const headlineHighlight = highlightEnd ? HERO_HEADLINE_END : null;

  return (
    <section dir="rtl" className="relative bg-white py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* Mobile: text first (order-1), image second (order-2). Desktop: RTL layout unchanged via lg:order-* */}
          <div className="order-1 flex flex-col items-center text-center md:items-end md:text-right lg:order-1">
            <h1 className="mx-auto max-w-[20ch] text-3xl font-semibold leading-tight tracking-tight text-caleno-ink md:mx-0 md:max-w-none md:text-5xl">
              {headlineRest}
              {headlineHighlight && <span className="text-caleno-brand">{headlineHighlight}</span>}
            </h1>
            <p className="mx-auto mt-4 max-w-[60ch] text-base font-normal leading-relaxed text-gray-500 md:mt-6 md:text-lg">
              {HERO.subheadline}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start md:gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-caleno-ink px-6 py-3.5 text-base font-medium leading-normal text-white shadow-sm transition-all duration-200 hover:bg-[#1F2937] hover:-translate-y-px hover:shadow-md active:translate-y-0"
              >
                {HERO.primaryCta}
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3.5 text-base font-medium leading-normal text-caleno-ink hover:bg-caleno-off"
              >
                {HERO.secondaryCta}
              </a>
            </div>
          </div>
          <div className="order-2 relative flex justify-center lg:order-2 lg:justify-end">
            <div
              className="h-64 w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white shadow-lg md:h-80 lg:h-96"
              aria-hidden
            >
              <div className="flex h-full items-center justify-center text-gray-400">
                Product screenshot / mock
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
