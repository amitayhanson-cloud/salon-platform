"use client"
import { useEffect, useState } from "react"
import { AnimatedText } from "./animated-text"
import { HeroFloatingPathsBackground } from "./hero-floating-paths"

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let rafId: number
    let currentProgress = 0

    const handleScroll = () => {
      const scrollY = window.scrollY
      const maxScroll = 400
      const targetProgress = Math.min(scrollY / maxScroll, 1)

      const smoothUpdate = () => {
        currentProgress += (targetProgress - currentProgress) * 0.1

        if (Math.abs(targetProgress - currentProgress) > 0.001) {
          setScrollProgress(currentProgress)
          rafId = requestAnimationFrame(smoothUpdate)
        } else {
          setScrollProgress(targetProgress)
        }
      }

      cancelAnimationFrame(rafId)
      smoothUpdate()
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      cancelAnimationFrame(rafId)
    }
  }, [])

  const easeOutQuad = (t: number) => t * (2 - t)
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

  const scale = 1 - easeOutQuad(scrollProgress) * 0.15
  const borderRadius = easeOutCubic(scrollProgress) * 48
  const heightVh = 100 - easeOutQuad(scrollProgress) * 37.5

  return (
    <section className="pt-32 pb-12 px-6 min-h-screen flex items-center relative overflow-hidden">
      <div className="absolute inset-0 top-0">
        <div
          className="relative box-border w-full overflow-hidden border-x-[6px] border-b-[6px] border-black will-change-transform sm:border-x-8 sm:border-b-8"
          style={{
            transform: `scale(${scale})`,
            borderRadius: `${borderRadius}px`,
            height: `${heightVh}vh`,
          }}
        >
          <HeroFloatingPathsBackground />
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 w-full overflow-hidden pointer-events-none z-[5] flex items-end justify-center"
        style={{
          transform: `translateY(${scrollProgress * 150}px)`,
          opacity: 1 - scrollProgress * 0.8,
          height: "100%",
        }}
      >
        <span
          className="block text-white font-bold text-[28vw] sm:text-[25vw] md:text-[22vw] lg:text-[20vw] tracking-tighter select-none text-center leading-none"
          style={{ marginBottom: "0" }}
        >
          HOMIE
        </span>
      </div>

      <div className="max-w-7xl mx-auto w-full relative z-10">
        <div className="relative mb-12 text-center">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[min(36vh,16rem)] w-[min(100%,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/18 blur-2xl sm:h-[min(32vh,18rem)] sm:w-[min(100%,40rem)]"
            aria-hidden
          />
          <div
            className={`transition-all duration-1000 delay-[800ms] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
          >
            <h1
              dir="rtl"
              lang="he"
              className="font-hero mx-auto mb-6 w-full max-w-6xl px-4 text-[3.375rem] font-normal leading-[1.26] text-zinc-950 sm:text-[4.375rem] sm:leading-[1.28] md:text-[5.375rem] md:leading-[1.29] lg:text-[6.375rem] lg:leading-[1.3] xl:text-[7.375rem] xl:leading-[1.32] 2xl:text-[8.25rem]"
            >
              <AnimatedText
                text={"קאלנו מציעה מעבר\nלמה שאתם מכירים"}
                delay={0.3}
                lineClassNames={["text-zinc-900 font-normal", "text-zinc-900 font-normal"]}
                firstWordClassName="text-[#4e979f]"
              />
            </h1>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-8">
          <div className="relative">
            <div
              className={`relative w-[min(92vw,336px)] md:w-[424px] lg:w-[520px] xl:w-[580px] will-change-transform transition-all duration-[1500ms] ease-out delay-500 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[400px]"
              }`}
            >
              <img
                src="/images/newphone.png"
                alt="אפליקציית Caleno במובייל"
                className="relative z-10 h-auto w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
