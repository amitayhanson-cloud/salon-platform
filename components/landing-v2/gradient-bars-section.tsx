"use client"

import type { CSSProperties, ReactNode } from "react"

import { FEATURES_SECTION_BACKGROUND } from "./features-section-background"

/** Teal palette aligned with hero / features accents. */
export const GRADIENT_BARS_PALETTE = ["#417374", "#3c7a8d", "#7ac7d4"] as const

function lerpChannel(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}

function lerpHex(from: string, to: string, t: number) {
  const parse = (h: string) => {
    const x = h.replace("#", "")
    return Number.parseInt(x.length === 3 ? x.split("").map((c) => c + c).join("") : x, 16)
  }
  const af = parse(from)
  const bf = parse(to)
  const ar = (af >> 16) & 255
  const ag = (af >> 8) & 255
  const ab = af & 255
  const br = (bf >> 16) & 255
  const bg = (bf >> 8) & 255
  const bb = bf & 255
  const r = lerpChannel(ar, br, t)
  const g = lerpChannel(ag, bg, t)
  const b = lerpChannel(ab, bb, t)
  return `rgb(${r} ${g} ${b})`
}

function barColorAlongPalette(palette: readonly string[], index: number, total: number) {
  if (palette.length === 0) return "transparent"
  if (palette.length === 1 || total <= 1) return palette[0]
  const t = (index / (total - 1)) * (palette.length - 1)
  const i = Math.min(Math.floor(t), palette.length - 2)
  const f = t - i
  return lerpHex(palette[i], palette[i + 1], f)
}

export type GradientBarsProps = {
  numBars?: number
  /** Colours blended left-to-right across bars. Ignored if empty. */
  palette?: readonly string[]
  gradientTo?: string
  animationDuration?: number
  className?: string
}

function calculateBarHeight(index: number, total: number) {
  if (total <= 1) return 100
  const position = index / (total - 1)
  const maxHeight = 100
  const minHeight = 30
  const center = 0.5
  const distanceFromCenter = Math.abs(position - center)
  const heightPercentage = Math.pow(distanceFromCenter * 2, 1.2)
  return minHeight + (maxHeight - minHeight) * heightPercentage
}

export function GradientBars({
  numBars = 15,
  palette = GRADIENT_BARS_PALETTE,
  gradientTo = "transparent",
  animationDuration = 2,
  className = "",
}: GradientBarsProps) {
  return (
    <>
      <style>{`
        @keyframes landing-v2-pulse-bar {
          0% { transform: scaleY(var(--initial-scale)); }
          100% { transform: scaleY(calc(var(--initial-scale) * 0.7)); }
        }
      `}</style>

      <div className={`absolute inset-0 z-0 overflow-hidden ${className}`}>
        <div
          className="flex h-full"
          style={{
            width: "100%",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitFontSmoothing: "antialiased",
          }}
        >
          {Array.from({ length: numBars }).map((_, index) => {
            const height = calculateBarHeight(index, numBars)
            const initialScale = height / 100
            const gradientFrom =
              palette.length > 0 ? barColorAlongPalette(palette, index, numBars) : "transparent"
            const barStyle = {
              flex: `1 0 calc(100% / ${numBars})`,
              maxWidth: `calc(100% / ${numBars})`,
              height: "100%",
              background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
              transform: `scaleY(${initialScale})`,
              transformOrigin: "bottom",
              transition: "transform 0.5s ease-in-out",
              animation: `landing-v2-pulse-bar ${animationDuration}s ease-in-out infinite alternate`,
              animationDelay: `${index * 0.1}s`,
              outline: "1px solid rgba(0, 0, 0, 0)",
              boxSizing: "border-box",
              "--initial-scale": String(initialScale),
            } as CSSProperties

            return <div key={index} style={barStyle} />
          })}
        </div>
      </div>
    </>
  )
}

export type GradientBarsSectionProps = {
  id?: string
  numBars?: number
  palette?: readonly string[]
  gradientTo?: string
  animationDuration?: number
  className?: string
  contentClassName?: string
  children?: ReactNode
}

export function GradientBarsSection({
  id,
  numBars = 7,
  palette = GRADIENT_BARS_PALETTE,
  gradientTo = "transparent",
  animationDuration = 2,
  className = "",
  contentClassName = "",
  children,
}: GradientBarsSectionProps) {
  return (
    <section
      id={id}
      className={`relative flex min-h-screen w-full flex-col overflow-hidden ${className}`}
    >
      <div className={`${FEATURES_SECTION_BACKGROUND} z-0`} aria-hidden />
      <GradientBars
        className="z-[1]"
        numBars={numBars}
        palette={palette}
        gradientTo={gradientTo}
        animationDuration={animationDuration}
      />

      {children ? (
        <div
          className={`relative z-10 flex w-full flex-1 flex-col items-center px-4 ${contentClassName}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
