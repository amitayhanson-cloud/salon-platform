"use client"

import { useCallback, useEffect, useRef, useState } from "react"

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

  return (
    <section
      id="stats-section"
      ref={sectionRef}
      dir="rtl"
      lang="he"
      className="bg-background px-6 py-24"
    >
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-12 lg:gap-16">
          <div
            className={`text-center transition-all delay-200 duration-1000 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <p className="mb-2 text-6xl font-light leading-none text-foreground tabular-nums md:text-7xl ltr">
              {control.value}
            </p>
            <p className="text-sm leading-snug text-muted-foreground md:text-base">
              שליטה בניהול העסק
            </p>
          </div>

          <div
            className={`text-center transition-all delay-300 duration-1000 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <p className="mb-2 text-6xl font-light leading-none text-foreground tabular-nums md:text-7xl ltr">
              {businesses.value}
            </p>
            <p className="text-sm leading-snug text-muted-foreground md:text-base">
              עסקים שכבר צומחים איתנו
            </p>
          </div>

          <div
            className={`text-center transition-all delay-400 duration-1000 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <p className="mb-2 text-6xl font-light leading-none text-foreground tabular-nums md:text-7xl ltr">
              {tools.value}
            </p>
            <p className="text-sm leading-snug text-muted-foreground md:text-base">
              כלים לניהול העסק
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
