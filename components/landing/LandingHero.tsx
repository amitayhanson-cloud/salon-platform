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
        "relative mt-6 overflow-hidden rounded-3xl border border-[#E2E8F0] shadow-sm",
        "px-6 py-14 sm:py-16 md:py-20",
      )}
    >
      {/* Template gradient: soft pink/peach (#ffe3ea → #ffd9c8 → #fed4d6) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 500px at 50% -10%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%),
            linear-gradient(180deg, #ffe3ea 0%, #ffd9c8 45%, #fed4d6 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px, 40px 40px",
          maskImage: "radial-gradient(100% 70% at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0.05))",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Pill badges (template style) */}
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-[#E2E8F0] bg-white/70 px-2.5 py-1 text-xs font-medium shadow-sm">
            חדש
          </span>
          <span className="rounded-full border border-[#E2E8F0] bg-white/70 px-3 py-1 text-xs text-[#64748B] shadow-sm">
            ניהול תורים, לקוחות ואתר במקום אחד
          </span>
        </div>

        <h1 className="text-balance text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl md:text-6xl">
          {headlineRest}
          {headlineHighlight && <span className="text-caleno-brand">{headlineHighlight}</span>}
        </h1>

        <p className="mt-4 text-pretty text-base leading-relaxed text-[#64748B] sm:text-lg">
          {HERO.subheadline}
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-4 text-sm font-medium text-white shadow shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-colors hover:bg-neutral-800 sm:py-5 sm:text-base md:py-6"
          >
            {HERO.primaryCta}
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-[#E2E8F0]/80 bg-white/80 px-5 py-4 text-sm font-medium text-[#0F172A] backdrop-blur transition-colors hover:bg-white/90 sm:text-base"
          >
            {HERO.secondaryCta}
          </Link>
        </div>

        {/* Optional hero image below CTAs (kept inside card) */}
        {heroImageUrl && (
          <div className="relative mx-auto mt-10 max-w-md">
            <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-md aspect-video">
              <Image
                src={heroImageUrl}
                alt=""
                width={600}
                height={400}
                className="h-full w-full object-cover object-center"
                unoptimized
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
