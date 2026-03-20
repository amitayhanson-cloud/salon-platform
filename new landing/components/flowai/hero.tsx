import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Hero() {
  return (
    <section
      className={cn("relative mt-6 overflow-hidden rounded-3xl border shadow-sm", "px-6 py-14 sm:py-16 md:py-20")}
    >
      {/* Background gradient and subtle grid */}
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
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="rounded-full border bg-white/70 px-2.5 py-1 text-xs font-medium shadow-sm">New</span>
          <span className="rounded-full border bg-white/70 px-3 py-1 text-xs text-muted-foreground shadow-sm">
            Smarter Project Planning
          </span>
        </div>

        <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
          Keep Your Team Aligned in Minutes with FlowAI
        </h1>

        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Assign tasks, track progress, and keep everyone in sync—effortlessly, all in one place.
        </p>

        <div className="mt-7 flex items-center justify-center gap-3">
          <Button
            asChild
            className={cn(
              "rounded-full px-5 py-5 sm:py-6 text-sm sm:text-base",
              "bg-neutral-900 hover:bg-neutral-800 text-white shadow",
              "shadow-[inset_0_1px_0_rgba(255,255,255,.15)]",
            )}
          >
            <Link href="/signup">Try FlowAI for Free</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full border-foreground/10 bg-white/80 backdrop-blur">
            <Link href="#how-it-works" aria-label="See how FlowAI works">
              See How It Works
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

export default Hero
