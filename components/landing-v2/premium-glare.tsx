import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * iOS-style “premium glare”: top + physical-right edge highlights (RTL reading start),
 * inset rim, squircle radius, frosted tint + blur.
 */
export const premiumGlareSurface =
  "relative overflow-hidden rounded-[2rem] border border-b-white/10 border-l-white/10 border-r-white/30 border-t-white/30 bg-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07),inset_0_1px_1px_0_rgba(255,255,255,0.4)] backdrop-blur-xl"

export const premiumGlareHoverShadow =
  "0 12px 40px 0 rgba(31, 38, 135, 0.11), inset 0 1px 1px 0 rgba(255, 255, 255, 0.4)"

/** Soft highlight on the top-right (screen) corner. */
export function PremiumGlareShine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -top-px right-0 z-[1] h-[44%] w-[52%] rounded-[inherit] bg-gradient-to-bl from-white/40 via-white/12 to-transparent opacity-80",
        className,
      )}
      aria-hidden
    />
  )
}

/** Optional hover sheen (respect reduced motion in parent). */
export function PremiumGlareHoverSheen({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-gradient-to-br from-white/25 via-transparent to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-[0.38] motion-reduce:group-hover:opacity-0",
        className,
      )}
      aria-hidden
    />
  )
}

export function PremiumGlareFrame({
  children,
  className,
  contentClassName,
  withHoverSheen = true,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  withHoverSheen?: boolean
}) {
  return (
    <div className={cn("group", premiumGlareSurface, className)}>
      <PremiumGlareShine />
      {withHoverSheen ? <PremiumGlareHoverSheen /> : null}
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
    </div>
  )
}
