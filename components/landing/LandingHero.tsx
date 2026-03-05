import Link from "next/link";
import { HERO } from "@/lib/landingContent";

export function LandingHero() {
  return (
    <section dir="rtl" className="relative py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* Mobile: text first (order-1), image second (order-2). Desktop: RTL layout unchanged via lg:order-* */}
          <div className="order-1 flex flex-col items-center text-center md:items-end md:text-right lg:order-1">
            <h1 className="mx-auto max-w-[20ch] text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:mx-0 md:max-w-none lg:text-5xl">
              {HERO.headline}
            </h1>
            <p className="mt-4 text-lg text-gray-600 sm:mt-6">
              {HERO.subheadline}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start md:gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-800"
              >
                {HERO.primaryCta}
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-50"
              >
                {HERO.secondaryCta}
              </a>
            </div>
          </div>
          <div className="order-2 relative flex justify-center lg:order-2 lg:justify-end">
            <div
              className="h-64 w-full max-w-md rounded-2xl border border-gray-200 bg-gray-100 shadow-lg sm:h-80 lg:h-96"
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
