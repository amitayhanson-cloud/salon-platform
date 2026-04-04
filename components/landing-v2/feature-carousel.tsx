"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import {
  CalendarClock,
  ContactRound,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  Megaphone,
  MessagesSquare,
  ShoppingBag,
  Smartphone,
  UserCog,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { cn } from "@/lib/utils"

import { PremiumGlareShine } from "./premium-glare"

const FEATURES: {
  id: string
  label: string
  icon: LucideIcon
  image: string
  description: string
}[] = [
  {
    id: "queues",
    label: "ניהול תורים",
    icon: CalendarClock,
    image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1200",
    description: "ניהול תורים יעיל ושיבוץ מרשימת המתנה.",
  },
  {
    id: "personal-site",
    label: "אתר אישי",
    icon: LayoutTemplate,
    image: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=1200",
    description: "אתר אישי שמעוצב בדיוק לפי המותג שלך.",
  },
  {
    id: "clients",
    label: "ניהול ומעקב לקוחות",
    icon: ContactRound,
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1200",
    description: "ניהול מאגר לקוחות חכם עם היסטורית טיפולים וכרטיסיות.",
  },
  {
    id: "whatsapp",
    label: "אוטומציות WhatsApp",
    icon: MessagesSquare,
    image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1200",
    description: "תזכורות ואישורי הזמנה ללקוח, חיסכון בזמן ומניעת ביטולים.",
  },
  {
    id: "staff",
    label: "ניהול עובדים",
    icon: UserCog,
    image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?q=80&w=1200",
    description: "משמרות והרשאות בממשק אחד פשוט.",
  },
  {
    id: "dashboard",
    label: "לוח בקרה",
    icon: LayoutDashboard,
    image: "https://images.unsplash.com/photo-1551288049-bbda38a10ad5?q=80&w=1200",
    description: "צפייה בביצועים, הכנסות ומדדים בזמן אמת.",
  },
  {
    id: "marketing",
    label: "שיווק העסק",
    icon: Megaphone,
    image: "https://images.unsplash.com/photo-1533750349088-cd871a92f312?q=80&w=1200",
    description: "כלים לשימור לקוחות והחזרת לקוחות ״רדומים״.",
  },
  {
    id: "mobile-control",
    label: "שליטה מלאה מהנייד",
    icon: Smartphone,
    image: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?q=80&w=1200",
    description: "ניהול מלא של העסק בכף היד.",
  },
  {
    id: "data-protection",
    label: "הגנת מידע",
    icon: Lock,
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=1200",
    description: "הגנה על המידע שלך ושל הלקוחות ברמה הגבוהה ביותר.",
  },
  {
    id: "digital-store",
    label: "חנות דיגיטלית",
    icon: ShoppingBag,
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200",
    description: "הגדילו את ההכנסות עם חנות אונליין.",
  },
]

const AUTO_PLAY_INTERVAL = 3000
const ITEM_HEIGHT = 72

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min
}

export function FeatureCarousel() {
  const [step, setStep] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const reduceMotion = useReducedMotion()

  const currentIndex = ((step % FEATURES.length) + FEATURES.length) % FEATURES.length

  const nextStep = useCallback(() => {
    setStep((prev) => prev + 1)
  }, [])

  const handleChipClick = (index: number) => {
    const diff = (index - currentIndex + FEATURES.length) % FEATURES.length
    if (diff > 0) setStep((s) => s + diff)
  }

  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(nextStep, AUTO_PLAY_INTERVAL)
    return () => clearInterval(interval)
  }, [nextStep, isPaused])

  const getCardStatus = (index: number) => {
    const diff = index - currentIndex
    const len = FEATURES.length

    let normalizedDiff = diff
    if (diff > len / 2) normalizedDiff -= len
    if (diff < -len / 2) normalizedDiff += len

    if (normalizedDiff === 0) return "active"
    if (normalizedDiff === -1) return "prev"
    if (normalizedDiff === 1) return "next"
    return "hidden"
  }

  return (
    <div className="mx-auto w-full max-w-7xl md:p-8">
      <div className="relative flex min-h-[600px] flex-col overflow-hidden rounded-[2.5rem] border border-white/25 bg-slate-400/5 shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] backdrop-blur-md lg:aspect-video lg:flex-row lg:rounded-[4rem]">
        <div
          dir="rtl"
          lang="he"
          className="font-hero relative z-30 order-2 flex min-h-[350px] w-full flex-col items-start justify-center overflow-hidden bg-gradient-to-b from-[#4a7d7e] via-[#3d6e6f] to-[#325b5c] px-8 md:min-h-[450px] md:px-16 lg:order-1 lg:h-full lg:w-[40%] lg:pl-16"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-12 bg-gradient-to-b from-[#3d6e6f] via-[#3d6e6f]/80 to-transparent md:h-20 lg:h-16" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-12 bg-gradient-to-t from-[#3d6e6f] via-[#3d6e6f]/80 to-transparent md:h-20 lg:h-16" />
          <div className="relative z-20 flex h-full w-full items-center justify-center lg:justify-start">
            {FEATURES.map((feature, index) => {
              const isActive = index === currentIndex
              const distance = index - currentIndex
              const wrappedDistance = wrap(
                -(FEATURES.length / 2),
                FEATURES.length / 2,
                distance,
              )
              const Icon = feature.icon

              return (
                <motion.div
                  key={feature.id}
                  style={{
                    height: ITEM_HEIGHT,
                    width: "fit-content",
                  }}
                  animate={{
                    y: wrappedDistance * ITEM_HEIGHT,
                    opacity: 1 - Math.abs(wrappedDistance) * 0.25,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 90,
                    damping: 22,
                    mass: 1,
                  }}
                  className="absolute flex items-center justify-start"
                >
                  <motion.button
                    type="button"
                    onClick={() => handleChipClick(index)}
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                    whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className={cn(
                      "group relative flex flex-row-reverse items-center gap-4 rounded-full border py-3.5 text-right transition-all duration-700 md:py-5 lg:py-4",
                      "px-6 md:px-10 lg:px-8",
                      "max-w-[min(100%,280px)] sm:max-w-none",
                      // Matte frosted glass: strong blur, no glossy ring; soft inset rim + diffuse shadow
                      "backdrop-blur-2xl backdrop-saturate-[1.15]",
                      isActive
                        ? "z-10 border-white/50 bg-white/[0.86] text-[#3d6e6f] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.22),inset_0_1px_0_0_rgba(255,255,255,0.72),inset_0_-1px_0_0_rgba(61,110,111,0.06)]"
                        : "border-white/[0.18] bg-white/[0.075] text-white/88 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_6px_28px_-10px_rgba(0,0,0,0.45)] hover:border-white/[0.28] hover:bg-white/[0.11] hover:text-white hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_8px_32px_-12px_rgba(0,0,0,0.4)]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center transition-colors duration-500",
                        isActive ? "text-[#3d6e6f]" : "text-white/55",
                      )}
                    >
                      <Icon className="size-[18px]" strokeWidth={2} />
                    </div>

                    <span
                      className={cn(
                        "min-w-0 text-sm font-normal leading-snug tracking-tight md:text-[15px]",
                        isActive
                          ? "[text-shadow:0_1px_0_rgba(255,255,255,0.95)]"
                          : "[text-shadow:0_1px_2px_rgba(0,0,0,0.35)]",
                      )}
                    >
                      {feature.label}
                    </span>
                  </motion.button>
                </motion.div>
              )
            })}
          </div>
        </div>

        <div className="relative order-1 flex min-h-[500px] flex-1 items-center justify-center overflow-hidden border-b border-white/20 bg-gradient-to-br from-slate-200/75 via-background/50 to-slate-100/85 px-6 py-16 md:min-h-[600px] md:px-12 md:py-24 lg:order-2 lg:h-full lg:border-b-0 lg:border-l lg:border-white/20 lg:px-10 lg:py-16">
          <div className="relative flex aspect-[4/5] w-full max-w-[420px] items-center justify-center">
            {FEATURES.map((feature, index) => {
              const status = getCardStatus(index)
              const isActive = status === "active"
              const isPrev = status === "prev"
              const isNext = status === "next"

              return (
                <motion.div
                  key={feature.id}
                  initial={false}
                  animate={{
                    x: isActive ? 0 : isPrev ? -100 : isNext ? 100 : 0,
                    scale: isActive ? 1 : isPrev || isNext ? 0.85 : 0.7,
                    opacity: isActive ? 1 : isPrev || isNext ? 0.4 : 0,
                    rotate: isPrev ? -3 : isNext ? 3 : 0,
                    zIndex: isActive ? 20 : isPrev || isNext ? 10 : 0,
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 25,
                    mass: 0.8,
                  }}
                  className="absolute inset-0 origin-center overflow-hidden rounded-[2rem] border-[6px] border-b-white/10 border-l-white/10 border-r-white/30 border-t-white/30 bg-white/15 shadow-[0_8px_32px_0_rgba(31,38,135,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.4)] backdrop-blur-xl md:rounded-[2.8rem] md:border-8"
                >
                  <PremiumGlareShine className="z-[2] opacity-90" />
                  <img
                    src={feature.image}
                    alt={feature.label}
                    className={cn(
                      "h-full w-full object-cover transition-all duration-700",
                      isActive ? "blur-0 grayscale-0" : "blur-[2px] brightness-75 grayscale",
                    )}
                  />

                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        dir="rtl"
                        lang="he"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-10 pt-32 font-hero"
                      >
                        <div className="mb-3 w-fit rounded-full border border-white/30 bg-white/20 px-4 py-1.5 text-[11px] font-normal text-foreground shadow-lg backdrop-blur-xl [text-shadow:0_1px_0_rgba(255,255,255,0.9)]">
                          <span className="tabular-nums">{index + 1}</span>
                          <span className="mx-1">•</span>
                          <span>{feature.label}</span>
                        </div>
                        <p className="text-xl font-normal leading-snug tracking-tight text-white drop-shadow-md md:text-2xl">
                          {feature.description}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div
                    dir="rtl"
                    className={cn(
                      "absolute right-8 top-8 flex flex-row-reverse items-center gap-3 transition-opacity duration-300",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <div className="size-2 rounded-full bg-white shadow-[0_0_10px_white]" />
                    <span className="text-[10px] font-normal tracking-wide text-white/80">מוצג כעת</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
