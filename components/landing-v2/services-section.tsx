"use client"

import type { LucideIcon } from "lucide-react"
import { ArrowDown, LayoutTemplate, MessagesSquare, Plus, Shield } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import type { KeyboardEvent } from "react"
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"

import { FeatureCarousel } from "@/components/landing-v2/feature-carousel"
import { cn } from "@/lib/utils"

import { LiquidGlassPanel } from "./liquid-glass-panel"
import { SpikeBurst } from "./spike-burst"

const keyFeatures = [
  {
    icon: LayoutTemplate,
    title: "אתר מותאם לעסק",
    description: "אתר אישי שמתאים לאופי העסק ומסייע בניהול ושיווק.",
  },
  {
    icon: MessagesSquare,
    title: "אוטומציות WhatsApp",
    description: "תזכורות, אישורי הגעה ומעקב אישי נשלחים אוטומטית.",
  },
  {
    icon: Shield,
    title: "תשלום מאובטח",
    description: "בטחון מלא לך וללקוחות שלך.",
  },
]

function AnimatedIcon({ Icon }: { Icon: LucideIcon }) {
  const [isVisible, setIsVisible] = useState(false)
  const iconRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.3 },
    )

    if (iconRef.current) {
      observer.observe(iconRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={iconRef} className="relative">
      <Icon
        className={`h-16 w-16 text-white ${isVisible ? "animate-draw-icon" : ""}`}
        strokeWidth={1}
        style={{
          strokeDasharray: isVisible ? undefined : 1000,
          strokeDashoffset: isVisible ? undefined : 1000,
        }}
      />
    </div>
  )
}

/** Matches Tailwind `md` (viewport &lt; 768px). */
function useIsMobileBelowMd() {
  const [isMobile, setIsMobile] = useState(false)

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  return isMobile
}

const OFFER_CARD_MIN_H = "min-h-[260px] md:min-h-[280px]"
/** Frosted glass on dark spike field — overrides premium glare solids. */
const OFFER_CARD_GLASS =
  "h-full rounded-[2rem] !border-white/10 !border !bg-white/5 !backdrop-blur-xl !shadow-[0_12px_48px_rgba(0,0,0,0.35)]"

function OfferFlipCard({
  feature,
  index,
  isMobile,
  isFlipped,
  onMobileToggle,
}: {
  feature: (typeof keyFeatures)[number]
  index: number
  isMobile: boolean
  isFlipped: boolean
  onMobileToggle: (index: number) => void
}) {
  const Icon = feature.icon

  const handleMobileActivate = useCallback(() => {
    onMobileToggle(index)
  }, [index, onMobileToggle])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isMobile) return
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        handleMobileActivate()
      }
    },
    [isMobile, handleMobileActivate],
  )

  return (
    <div
      role={isMobile ? "button" : undefined}
      aria-expanded={isMobile ? isFlipped : undefined}
      aria-label={isMobile ? `${feature.title} — לחצו לפרטים` : undefined}
      className={cn(
        "group h-full w-full outline-none [perspective:1000px]",
        OFFER_CARD_MIN_H,
        "focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061218]",
        isMobile && "cursor-pointer select-none",
      )}
      tabIndex={0}
      onClick={isMobile ? handleMobileActivate : undefined}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "h-full w-full",
          OFFER_CARD_MIN_H,
          "ease-out [transform-style:preserve-3d]",
          "transition-transform",
          isMobile
            ? cn(
                "duration-400 motion-reduce:duration-200",
                isFlipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
              )
            : cn(
                "duration-700",
                "group-hover:[transform:rotateY(180deg)] group-focus-within:[transform:rotateY(180deg)]",
                "motion-reduce:transition-none motion-reduce:group-hover:[transform:none] motion-reduce:group-focus-within:[transform:none]",
              ),
        )}
      >
        {/* No overflow-hidden here — it flattens 3D and mirrors the front onto the "back". */}
        <div
          dir="rtl"
          lang="he"
          className={cn("relative h-full w-full [transform-style:preserve-3d]", OFFER_CARD_MIN_H)}
        >
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:translateZ(3px)]">
            <LiquidGlassPanel
              tone="light"
              interactive={false}
              withGlareDecorations={false}
              className={cn(OFFER_CARD_GLASS, OFFER_CARD_MIN_H)}
              contentClassName={cn(
                "relative flex h-full flex-col items-center justify-center p-6 text-center sm:p-8",
                OFFER_CARD_MIN_H,
              )}
            >
              <Plus
                className="pointer-events-none absolute top-3 left-3 z-10 size-4 stroke-[1.25] text-white/35 md:hidden"
                aria-hidden
              />
              <div className="mb-5 flex shrink-0 justify-center sm:mb-6">
                <AnimatedIcon Icon={Icon} />
              </div>
              <h3 className="w-full text-pretty text-lg font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)] sm:text-xl">
                {feature.title}
              </h3>
              <p className="mt-4 hidden max-w-prose whitespace-pre-line text-sm leading-relaxed text-white/80 motion-reduce:block [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                {feature.description}
              </p>
            </LiquidGlassPanel>
          </div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(3px)] motion-reduce:hidden">
            <LiquidGlassPanel
              tone="light"
              interactive={false}
              withGlareDecorations={false}
              className={cn(OFFER_CARD_GLASS, OFFER_CARD_MIN_H)}
              contentClassName={cn(
                "flex h-full w-full flex-col items-center justify-center p-6 text-center sm:p-8",
                OFFER_CARD_MIN_H,
              )}
            >
              <p className="w-full max-w-prose whitespace-pre-line text-pretty text-sm leading-relaxed text-white/85 sm:text-base [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">
                {feature.description}
              </p>
            </LiquidGlassPanel>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ServicesSection() {
  const isMobile = useIsMobileBelowMd()
  const reduceMotion = useReducedMotion()
  const [mobileFlippedIndex, setMobileFlippedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!isMobile) setMobileFlippedIndex(null)
  }, [isMobile])

  const onMobileToggle = useCallback((index: number) => {
    setMobileFlippedIndex((prev) => (prev === index ? null : index))
  }, [])

  return (
    <section id="how-it-works" className="relative overflow-hidden px-6 py-32 pb-24">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_70%_10%,rgba(61,110,111,0.16),transparent),radial-gradient(ellipse_70%_50%_at_20%_80%,rgba(167,243,208,0.12),transparent),linear-gradient(180deg,rgb(255,255,255)_0%,rgb(248,250,252)_50%,rgb(255,255,255)_100%)]"
        aria-hidden
      />
      <style jsx>{`
        @keyframes drawPath {
          from {
            stroke-dasharray: 1000;
            stroke-dashoffset: 1000;
          }
          to {
            stroke-dasharray: 1000;
            stroke-dashoffset: 0;
          }
        }
        :global(.animate-draw-icon) :global(path),
        :global(.animate-draw-icon) :global(line),
        :global(.animate-draw-icon) :global(polyline),
        :global(.animate-draw-icon) :global(circle),
        :global(.animate-draw-icon) :global(rect) {
          animation: drawPath 2s ease-out forwards;
        }
      `}</style>

      <div id="feature-carousel" className="relative z-10 mx-auto max-w-7xl scroll-mt-28">
        <div className="mb-8 flex flex-col items-center md:mb-10" dir="rtl" lang="he">
          <p className="font-hero mx-auto max-w-4xl px-2 text-center text-2xl font-normal leading-snug tracking-tight text-balance text-foreground sm:text-3xl md:text-4xl">
            מה אתם מקבלים אתם שואלים?
          </p>
          <div className="mt-6 flex flex-col items-center md:mt-8">
            <motion.div
              aria-hidden
              initial={false}
              animate={
                reduceMotion
                  ? undefined
                  : {
                      y: [0, 7, 0],
                      opacity: [0.55, 1, 0.55],
                    }
              }
              transition={{
                duration: 2.35,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <ArrowDown
                className="h-9 w-9 text-[#417374] md:h-10 md:w-10"
                strokeWidth={1.35}
              />
            </motion.div>
            <span className="sr-only">מטה: קרוסלת התכונות</span>
          </div>
        </div>
        <FeatureCarousel />
      </div>

      {/* Caleno מציעה — SpikeBurst z-0, cards z-10 (full-bleed via -mx-6 vs section px-6) */}
      <div className="relative z-0 -mx-6 mt-16 min-h-[520px] overflow-hidden bg-[#061218] py-20 md:mt-20 md:min-h-[560px] md:py-24">
        <SpikeBurst />
        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div dir="rtl" lang="he" className="font-hero">
            <div className="mb-14 mt-2 text-center md:mb-16">
              <h2 className="mb-6 text-4xl font-normal tracking-tight text-balance text-white md:text-5xl [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]">
                Caleno מציעה
              </h2>
              <p className="mx-auto max-w-2xl text-lg leading-relaxed text-white/75 md:text-xl [text-shadow:0_1px_12px_rgba(0,0,0,0.3)]">
                המעטפת המושלמת לצמיחה שלכם
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {keyFeatures.map((feature, index) => (
                <OfferFlipCard
                  key={feature.title}
                  feature={feature}
                  index={index}
                  isMobile={isMobile}
                  isFlipped={mobileFlippedIndex === index}
                  onMobileToggle={onMobileToggle}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
