import Link from "next/link";
import Image from "next/image";
import { HERO } from "@/lib/landingContent";
import { cn } from "@/lib/utils";

const HERO_HEADLINE_END = "במקום אחד";

type LandingHeroProps = {
  /** When set, shown as hero image instead of placeholder. */
  heroImageUrl?: string | null;
};

export function LandingHero({ heroImageUrl }: LandingHeroProps) {
  const headline = HERO.headline;
  const highlightEnd = headline.endsWith(HERO_HEADLINE_END);
  const headlineRest = highlightEnd ? headline.slice(0, -HERO_HEADLINE_END.length) : headline;
  const headlineHighlight = highlightEnd ? HERO_HEADLINE_END : null;

  return (
    <section
      dir="rtl"
      className={cn(
        "relative mt-6 overflow-hidden rounded-3xl border border-[#E2E8F0] shadow-sm md:mt-8",
        "px-6 py-14 sm:py-16 md:py-20",
      )}
    >
      {/* Background gradient + subtle grid (template style) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 500px at 50% -10%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%),
            linear-gradient(180deg, #e6f5f7 0%, #f0f9fa 45%, #f8fafc 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(100% 70% at 50% 30%, rgba(0,0,0,0.15), transparent)",
        }}
      />

      <div className="relative z-10 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="flex flex-col items-center text-center md:items-end md:text-right">
          <h1 className="mx-auto max-w-[20ch] text-balance text-3xl font-extrabold leading-tight tracking-tight text-caleno-ink md:mx-0 md:max-w-none md:text-5xl lg:text-6xl">
            {headlineRest}
            {headlineHighlight && <span className="text-caleno-brand">{headlineHighlight}</span>}
          </h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-pretty text-base leading-relaxed text-[#64748B] md:mt-6 md:text-lg">
            {HERO.subheadline}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 md:justify-start md:gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-[#0F172A] px-6 py-3.5 text-base font-medium text-white shadow-sm transition-all hover:bg-[#1E293B] hover:-translate-y-px hover:shadow-md active:translate-y-0"
            >
              {HERO.primaryCta}
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-[#E2E8F0] bg-white/90 px-6 py-3.5 text-base font-medium text-caleno-ink backdrop-blur transition-colors hover:bg-white"
            >
              {HERO.secondaryCta}
            </Link>
          </div>
        </div>
        <div className="relative flex justify-center lg:justify-end">
          <div
            className="h-64 w-full max-w-md overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-md md:h-80 lg:h-96"
            aria-hidden
          >
            {heroImageUrl ? (
              <Image
                src={heroImageUrl}
                alt=""
                width={600}
                height={400}
                className="h-full w-full object-cover object-center"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[#94A3B8]">תצוגת מוצר</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
