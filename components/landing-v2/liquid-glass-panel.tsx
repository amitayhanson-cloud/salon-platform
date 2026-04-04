"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

import { PremiumGlareHoverSheen, PremiumGlareShine, premiumGlareHoverShadow, premiumGlareSurface } from "./premium-glare"

export type LiquidGlassPanelProps = {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  /** Rendered behind frosted content (e.g. WebGL), clipped to panel radius. */
  behindContent?: React.ReactNode
  /** Set false to skip corner shine + hover sheen (e.g. when they read as a white slab over a shader). */
  withGlareDecorations?: boolean
  /** `dark`: frosted light tint on saturated backgrounds (e.g. carousel). `light`: glass on pale gradients. */
  tone?: "light" | "dark"
  /** Hover lift + shadow (disabled when user prefers reduced motion). */
  interactive?: boolean
}

/**
 * Liquid glass panel with iOS-style premium glare (top / top-right edge + inset rim).
 */
export function LiquidGlassPanel({
  children,
  className,
  contentClassName,
  behindContent,
  withGlareDecorations = true,
  tone = "light",
  interactive = true,
}: LiquidGlassPanelProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={cn("group", premiumGlareSurface, tone === "dark" && "bg-white/12", className)}
      initial={false}
      whileHover={
        interactive && !reduceMotion
          ? {
              scale: 1.02,
              boxShadow: premiumGlareHoverShadow,
            }
          : undefined
      }
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
    >
      {withGlareDecorations ? (
        <>
          <PremiumGlareShine />
          <PremiumGlareHoverSheen />
        </>
      ) : null}
      {behindContent ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">{behindContent}</div>
      ) : null}
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
    </motion.div>
  )
}
