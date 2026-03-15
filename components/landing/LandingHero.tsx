import Link from "next/link";
import { HERO } from "@/lib/landingContent";
import { LandingDashboardPreview } from "./LandingDashboardPreview";

const HERO_HEADLINE_END = "במקום אחד";

export function LandingHero() {
  const headline = HERO.headline;
  const highlightEnd = headline.endsWith(HERO_HEADLINE_END);
  const headlineRest = highlightEnd ? headline.slice(0, -HERO_HEADLINE_END.length) : headline;
  const headlineHighlight = highlightEnd ? HERO_HEADLINE_END : null;

  return (
    <section
      dir="rtl"
      className="relative mt-6 overflow-hidden rounded-3xl border border-[#E2E8F0] shadow-sm px-6 py-14 sm:py-16 md:py-20"
    >
      {/* Caleno gradient: whiter at top, darker Caleno toward bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(180deg, #ffffff 0%, #f5fbfc 25%, #e6f5f7 55%, #cceef1 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px, 40px 40px",
          maskImage: "radial-gradient(100% 70% at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0.05))",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Pill badges */}
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

          {/* Same-size buttons */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-neutral-900 px-6 py-4 text-sm font-medium text-white shadow shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-colors hover:bg-neutral-800 sm:text-base"
            >
              {HERO.primaryCta}
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex min-w-[180px] items-center justify-center rounded-full border border-[#E2E8F0]/80 bg-white/80 px-6 py-4 text-sm font-medium text-[#0F172A] backdrop-blur transition-colors hover:bg-white/90 sm:text-base"
            >
              {HERO.secondaryCta}
            </Link>
          </div>
      </div>

      {/* Caleno box inside hero gradient */}
      <div className="relative z-10 mt-6">
        <LandingDashboardPreview />
      </div>
    </section>
  );
}
