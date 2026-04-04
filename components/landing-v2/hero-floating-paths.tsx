"use client"

import { motion } from "framer-motion"

import { FEATURES_SECTION_BG_PAINT } from "./features-section-background"

const LINE_PALETTE = ["#417374", "#3c7a8d", "#7ac7d4"] as const

function lineColorForPath(pathId: number, position: number): string {
  const mix = pathId * 17 + position * 31 + pathId * position * 3
  return LINE_PALETTE[((mix % 3) + 3) % 3]!
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    stroke: lineColorForPath(i, position),
  }))

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={`${position}-${path.id}`}
            d={path.d}
            stroke={path.stroke}
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + (path.id % 11) * 1.1,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  )
}

/** Animated line background (21st.dev-style paths only). */
export function HeroFloatingPathsBackground() {
  return (
    <div className="absolute inset-0" style={{ background: FEATURES_SECTION_BG_PAINT }}>
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
    </div>
  )
}
