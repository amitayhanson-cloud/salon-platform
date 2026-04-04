"use client"

import { useCallback, useEffect, useRef, useState } from "react"

function TrustStatCell({
  fadeClassName,
  value,
  label,
  statNumClass,
  statLabelClass,
}: {
  fadeClassName: string
  value: string
  label: string
  statNumClass: string
  statLabelClass: string
}) {
  return (
    <div className={fadeClassName}>
      <div className="text-center px-0.5 py-0 md:px-4 md:py-2">
        <p className={statNumClass}>{value}</p>
        <p className={statLabelClass}>{label}</p>
      </div>
    </div>
  )
}

function useCountUp(end: number, duration = 2000, suffix = "") {
  const [count, setCount] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    if (!hasStarted) return

    let startTime: number | undefined
    let animationFrame: number

    const animate = (currentTime: number) => {
      if (startTime === undefined) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)

      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      setCount(Math.floor(easeOutQuart * end))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [end, duration, hasStarted])

  const start = useCallback(() => setHasStarted(true), [])

  return { value: count + suffix, start, hasStarted }
}

export function StatsSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const hasTriggeredRef = useRef(false)
  const [isVisible, setIsVisible] = useState(false)

  const businesses = useCountUp(15, 2000, "+")
  const tools = useCountUp(10, 2000, "+")
  const control = useCountUp(100, 2000, "%")

  const businessesStartRef = useRef(businesses.start)
  const toolsStartRef = useRef(tools.start)
  const controlStartRef = useRef(control.start)
  businessesStartRef.current = businesses.start
  toolsStartRef.current = tools.start
  controlStartRef.current = control.start

  const triggerStats = useCallback(() => {
    if (hasTriggeredRef.current) return
    hasTriggeredRef.current = true
    setIsVisible(true)
    businessesStartRef.current()
    toolsStartRef.current()
    controlStartRef.current()
  }, [])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          triggerStats()
        }
      },
      { threshold: [0, 0.05, 0.15, 0.3], rootMargin: "0px 0px 10% 0px" },
    )

    observer.observe(el)

    const rafCheck = () => {
      if (hasTriggeredRef.current || !sectionRef.current) return
      const rect = sectionRef.current.getBoundingClientRect()
      const vh = window.innerHeight
      const visible = rect.top < vh && rect.bottom > 0
      if (visible) triggerStats()
    }

    requestAnimationFrame(rafCheck)

    return () => observer.disconnect()
  }, [triggerStats])

  /** Mobile: one full-width row (RTL: שליטה+100% right, 15+ center, 10+ left). */
  const fadeIn = (delayClass: string) =>
    `min-w-0 transition-all duration-1000 ${delayClass} ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 md:translate-y-8"}`
  const statNum =
    "mb-1 font-light tabular-nums leading-none text-foreground ltr md:mb-2 text-3xl sm:text-4xl md:text-6xl lg:text-7xl"
  const statLabel =
    "text-muted-foreground leading-tight text-[10px] sm:text-xs md:text-sm md:leading-snug lg:text-base"

  return (
    <section id="stats-section" ref={sectionRef} dir="rtl" lang="he" className="py-24 px-3 sm:px-6">
      <div className="mx-auto w-full max-w-none md:max-w-4xl">
        <div className="grid w-full grid-cols-3 gap-1 sm:gap-2 md:gap-8 lg:gap-10">
          <TrustStatCell
            fadeClassName={fadeIn("delay-200")}
            value={control.value}
            label="שליטה בניהול העסק"
            statNumClass={statNum}
            statLabelClass={statLabel}
          />
          <TrustStatCell
            fadeClassName={fadeIn("delay-300")}
            value={businesses.value}
            label="עסקים שכבר צומחים איתנו"
            statNumClass={statNum}
            statLabelClass={statLabel}
          />
          <TrustStatCell
            fadeClassName={fadeIn("delay-400")}
            value={tools.value}
            label="כלים לניהול העסק"
            statNumClass={statNum}
            statLabelClass={statLabel}
          />
        </div>
      </div>
    </section>
  )
}
