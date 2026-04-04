"use client"

import type { CSSProperties, HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

import "./border-rotate.css"

export type BorderRotateAnimationMode = "auto-rotate" | "rotate-on-hover" | "stop-rotate-on-hover"

export type BorderRotateGradientColors = {
  primary: string
  secondary: string
  accent: string
}

/** Caleno landing teal palette */
export const CALENO_GRADIENT_BORDER_COLORS: BorderRotateGradientColors = {
  primary: "#417374",
  secondary: "#3c7a8d",
  accent: "#7ac7d4",
}

function gradientBorderAnimationClass(mode: BorderRotateAnimationMode): string {
  switch (mode) {
    case "auto-rotate":
      return "gradient-border-auto"
    case "rotate-on-hover":
      return "gradient-border-hover"
    case "stop-rotate-on-hover":
      return "gradient-border-stop-hover"
    default:
      return ""
  }
}

export type BorderRotateProps = Omit<HTMLAttributes<HTMLDivElement>, "className"> & {
  children: ReactNode
  className?: string
  animationMode?: BorderRotateAnimationMode
  /** Duration in seconds */
  animationSpeed?: number
  gradientColors?: BorderRotateGradientColors
  backgroundColor?: string
  borderWidth?: number
  borderRadius?: number
  style?: CSSProperties
}

export function BorderRotate({
  children,
  className,
  animationMode = "auto-rotate",
  animationSpeed = 5,
  gradientColors = CALENO_GRADIENT_BORDER_COLORS,
  backgroundColor = "#ffffff",
  borderWidth = 2,
  borderRadius = 20,
  style,
  ...props
}: BorderRotateProps) {
  const { primary, secondary, accent } = gradientColors

  const combinedStyle = {
    "--animation-duration": `${animationSpeed}s`,
    border: `${borderWidth}px solid transparent`,
    borderRadius: `${borderRadius}px`,
    backgroundImage: `
      linear-gradient(${backgroundColor}, ${backgroundColor}),
      conic-gradient(
        from var(--gradient-angle, 0deg),
        ${primary} 0%,
        ${secondary} 37%,
        ${accent} 30%,
        ${secondary} 33%,
        ${primary} 40%,
        ${primary} 50%,
        ${secondary} 77%,
        ${accent} 80%,
        ${secondary} 83%,
        ${primary} 90%
      )
    `,
    backgroundClip: "padding-box, border-box",
    backgroundOrigin: "padding-box, border-box",
    ...style,
  } as CSSProperties

  return (
    <div
      className={cn("gradient-border-component", gradientBorderAnimationClass(animationMode), className)}
      style={combinedStyle}
      {...props}
    >
      {children}
    </div>
  )
}
