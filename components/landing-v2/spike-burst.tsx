"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useCallback, useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

/** Brand gradient (CSS vars --brand-secondary / --brand-accent) */
const BRAND_SECONDARY = { r: 60, g: 122, b: 141 } // #3C7A8D
const BRAND_ACCENT = { r: 122, g: 199, b: 212 } // #7AC7D4

const LINE_COUNT = 320

type SpikeLine = {
  baseAngle: number
  baseLen: number
  phaseA: number
  phaseB: number
  speed: number
  colorT: number
  lineWidth: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function createLines(width: number, height: number): SpikeLine[] {
  const maxReach = Math.min(height * 1.05, Math.hypot(width, height) * 0.96)
  /** Fan upward from bottom-center */
  const fanHalf = 0.82
  const lines: SpikeLine[] = []
  for (let i = 0; i < LINE_COUNT; i++) {
    const t = i / (LINE_COUNT - 1)
    const baseAngle = -Math.PI / 2 - fanHalf + t * (2 * fanHalf)
    lines.push({
      baseAngle,
      baseLen: maxReach * (0.48 + ((i * 17) % 75) / 170),
      phaseA: (i * 2.17) % (Math.PI * 2),
      phaseB: (i * 1.41) % (Math.PI * 2),
      speed: 0.06 + ((i * 11) % 40) / 400,
      colorT: t,
      lineWidth: 0.55 + ((i * 3) % 8) / 10,
    })
  }
  return lines
}

export type SpikeBurstProps = {
  className?: string
}

/**
 * Slow underwater-style radial spike burst (Stripe-adjacent aesthetic): hundreds of thin
 * glowing lines from bottom-center, canvas-rendered for performance.
 */
export function SpikeBurst({ className }: SpikeBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const linesRef = useRef<SpikeLine[] | null>(null)
  const reduceMotion = useReducedMotion()
  const rafRef = useRef<number>(0)

  const resizeAndInit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width * dpr))
    const h = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    linesRef.current = createLines(rect.width, rect.height)
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => resizeAndInit())
    ro.observe(el)
    resizeAndInit()
    return () => ro.disconnect()
  }, [resizeAndInit])

  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, dt: number) => {
    const lines = linesRef.current
    const w = canvas.width
    const h = canvas.height
    const dpr = w / (canvas.getBoundingClientRect().width || 1)
    if (!lines?.length || w < 2 || h < 2) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const cx = w / 2
    const cy = h - 2 * dpr
    const globalSway = Math.sin(dt * 0.038) * 0.022 + Math.sin(dt * 0.021) * 0.012
    const breathe = 0.97 + Math.sin(dt * 0.029) * 0.028

    ctx.globalCompositeOperation = "lighter"

    for (const line of lines) {
      const wa = Math.sin(dt * line.speed * 0.55 + line.phaseA) * 0.024
      const wb = Math.sin(dt * line.speed * 0.38 + line.phaseB) * 0.034
      const angle = line.baseAngle + wa + globalSway
      const len = line.baseLen * dpr * breathe * (1 + wb)
      const colorT = line.colorT
      const r = lerp(BRAND_SECONDARY.r, BRAND_ACCENT.r, colorT)
      const gch = lerp(BRAND_SECONDARY.g, BRAND_ACCENT.g, colorT)
      const bch = lerp(BRAND_SECONDARY.b, BRAND_ACCENT.b, colorT)
      const alpha = 0.155 + Math.sin(dt * line.speed * 0.35 + line.phaseB) * 0.038
      ctx.strokeStyle = `rgba(${r | 0}, ${gch | 0}, ${bch | 0}, ${Math.max(0.07, alpha)})`
      ctx.lineWidth = line.lineWidth * dpr
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
      ctx.stroke()
    }

    ctx.globalCompositeOperation = "source-over"
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d", { alpha: true })
      if (!ctx) return
      resizeAndInit()
      drawFrame(ctx, canvas, 0)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    let start = performance.now()

    const draw = (now: number) => {
      const dt = (now - start) * 0.001
      drawFrame(ctx, canvas, dt)
      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [reduceMotion, drawFrame, resizeAndInit])

  return (
    <motion.div
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
      aria-hidden
      initial={false}
      animate={
        reduceMotion
          ? undefined
          : {
              rotate: [0, 0.35, -0.28, 0.22, 0],
              scale: [1, 1.008, 0.996, 1.004, 1],
            }
      }
      transition={{
        duration: 96,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full block opacity-100"
        style={{ width: "100%", height: "100%" }}
      />
      {/* Soft depth wash — keeps spikes readable like an underwater grade */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#061218]/85 via-[#0a1f28]/25 to-transparent" />
    </motion.div>
  )
}
