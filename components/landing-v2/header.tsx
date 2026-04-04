"use client"

import type React from "react"
import { useState } from "react"
import { Menu, X, ArrowUpRight, ArrowRight } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

const LOGO_SVG = "/images/newlandinglogo.svg"
const LOGO_FALLBACK_SVG = "/images/new_landing_caleno_logo1.svg"

const glassBar =
  "relative overflow-hidden rounded-2xl border border-white/25 bg-white/60 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl transition-all duration-300"

const glassBarSheen =
  "pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/22 via-transparent to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover/header-bar:opacity-[0.35] motion-reduce:group-hover/header-bar:opacity-0"

const glassBarHighlight =
  "pointer-events-none absolute -top-px right-0 h-[52%] w-[40%] rounded-[inherit] bg-gradient-to-bl from-white/40 via-white/12 to-transparent opacity-85"

const glassBarRing =
  "pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/25"

const glassPill =
  "relative flex items-center gap-0 overflow-hidden rounded-full border border-white/25 bg-white/40 py-1 pl-5 pr-1 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl transition-shadow duration-300"

const pillHighlight =
  "pointer-events-none absolute -top-px right-0 h-[72%] w-[42%] rounded-full bg-gradient-to-bl from-white/35 via-white/10 to-transparent opacity-70"

const pillRing = "pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/25"

const navLinkClass =
  "cursor-pointer text-sm text-foreground/85 transition-colors hover:text-foreground [text-shadow:0_1px_0_rgba(255,255,255,0.88)]"

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [logoSrc, setLogoSrc] = useState(LOGO_SVG)
  const reduceMotion = useReducedMotion()

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const element = document.getElementById(targetId)

    if (element) {
      const headerOffset = 100
      const elementPosition = element.getBoundingClientRect().top + window.scrollY
      const offsetPosition = elementPosition - headerOffset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
      setIsOpen(false)
    }
  }

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  const ctaMotionProps = {
    whileHover: reduceMotion ? undefined : { scale: 1.03, boxShadow: "0 12px 40px 0 rgba(31, 38, 135, 0.12)" },
    whileTap: reduceMotion ? undefined : { scale: 0.98 },
    transition: { type: "spring" as const, stiffness: 400, damping: 24 },
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-4 pt-4 transition-all duration-300">
      <div className={`group/header-bar mx-auto max-w-7xl ${glassBar} px-6 py-3`}>
        <span aria-hidden className={glassBarHighlight} />
        <span aria-hidden className={glassBarRing} />
        <span aria-hidden className={glassBarSheen} />

        <div dir="ltr" className="relative z-10 flex w-full items-center gap-3 md:gap-6">
          <a
            href="#"
            onClick={handleLogoClick}
            className="flex shrink-0 cursor-pointer items-center"
            aria-label="Caleno"
          >
            <img
              src={logoSrc}
              alt="Caleno"
              className="h-10 w-auto max-w-[min(220px,50vw)] shrink-0 origin-left scale-[1.38] object-contain object-left drop-shadow-[0_1px_2px_rgba(15,23,42,0.08)] will-change-transform md:h-11 md:max-w-[min(240px,52vw)] md:scale-[1.32] lg:h-12 lg:max-w-[min(260px,54vw)] lg:scale-[1.26]"
              width={240}
              height={52}
              decoding="async"
              fetchPriority="high"
              onError={() => setLogoSrc((s) => (s === LOGO_FALLBACK_SVG ? s : LOGO_FALLBACK_SVG))}
              loading="eager"
            />
          </a>

          <nav className="hidden min-w-0 flex-1 justify-center gap-6 lg:gap-8 md:flex">
            <a href="#how-it-works" onClick={(e) => handleSmoothScroll(e, "how-it-works")} className={navLinkClass}>
              כלי ניהול
            </a>
            <a href="#features" onClick={(e) => handleSmoothScroll(e, "features")} className={navLinkClass}>
              למי מתאים
            </a>
            <a href="#pricing" onClick={(e) => handleSmoothScroll(e, "pricing")} className={navLinkClass}>
              עסקים
            </a>
            <a href="#testimonials" onClick={(e) => handleSmoothScroll(e, "testimonials")} className={navLinkClass}>
              תגובות
            </a>
            <a href="#faq" onClick={(e) => handleSmoothScroll(e, "faq")} className={navLinkClass}>
              FAQ
            </a>
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-2">
            <motion.button type="button" className={`${glassPill} group hidden md:inline-flex`} {...ctaMotionProps}>
              <span aria-hidden className={pillHighlight} />
              <span aria-hidden className={pillRing} />
              <span className="absolute inset-0 origin-right scale-x-0 rounded-full bg-foreground transition-transform duration-300 group-hover:scale-x-100" />
              <span className="relative z-10 pr-3 text-sm font-medium text-foreground transition-colors duration-300 group-hover:text-background [text-shadow:0_1px_0_rgba(255,255,255,0.88)]">
                צור עסק
              </span>
              <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full">
                <ArrowRight className="absolute h-4 w-4 text-foreground transition-opacity duration-300 group-hover:opacity-0" />
                <ArrowUpRight className="h-4 w-4 text-foreground opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-background" />
              </span>
            </motion.button>

            <button
              type="button"
              className="text-foreground transition-colors duration-300 [text-shadow:0_1px_0_rgba(255,255,255,0.85)] md:hidden"
              onClick={() => setIsOpen(!isOpen)}
              aria-expanded={isOpen}
              aria-label={isOpen ? "סגור תפריט" : "פתח תפריט"}
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isOpen && (
          <nav className="relative z-10 mt-6 flex flex-col gap-4 border-t border-white/20 pb-6 pt-6 md:hidden">
            <a href="#how-it-works" onClick={(e) => handleSmoothScroll(e, "how-it-works")} className={navLinkClass}>
              כלי ניהול
            </a>
            <a href="#features" onClick={(e) => handleSmoothScroll(e, "features")} className={navLinkClass}>
              למי מתאים
            </a>
            <a href="#pricing" onClick={(e) => handleSmoothScroll(e, "pricing")} className={navLinkClass}>
              עסקים
            </a>
            <a href="#testimonials" onClick={(e) => handleSmoothScroll(e, "testimonials")} className={navLinkClass}>
              תגובות
            </a>
            <a href="#faq" onClick={(e) => handleSmoothScroll(e, "faq")} className={navLinkClass}>
              FAQ
            </a>
            <div className="mt-4 flex flex-col gap-3 border-t border-white/20 pt-4">
              <a href="#" className={navLinkClass}>
                Login
              </a>
              <motion.button type="button" className={`${glassPill} group w-fit`} {...ctaMotionProps}>
                <span aria-hidden className={pillHighlight} />
                <span aria-hidden className={pillRing} />
                <span className="absolute inset-0 origin-right scale-x-0 rounded-full bg-foreground transition-transform duration-300 group-hover:scale-x-100" />
                <span className="relative z-10 pr-3 text-sm font-medium text-foreground transition-colors duration-300 group-hover:text-background [text-shadow:0_1px_0_rgba(255,255,255,0.88)]">
                  צור עסק
                </span>
                <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full">
                  <ArrowRight className="absolute h-4 w-4 text-foreground transition-opacity duration-300 group-hover:opacity-0" />
                  <ArrowUpRight className="h-4 w-4 text-foreground opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-background" />
                </span>
              </motion.button>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
