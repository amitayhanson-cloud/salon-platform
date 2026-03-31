"use client"

import type { LucideIcon } from "lucide-react"
import { LayoutTemplate, MessagesSquare, Shield } from "lucide-react"
import { useState, useEffect, useRef } from "react"

import { FeatureCarousel } from "@/components/landing-v2/feature-carousel"

const keyFeatures = [
  {
    icon: LayoutTemplate,
    title: "אתר מותאם לעסק",
    description: "אתר אישי שמתאים לאופי העסק ומסייע בניהול ושיווק.",
  },
  {
    icon: MessagesSquare,
    title: "אוטומציות WhatsApp",
    description: "תזכורות, אישורי הגעה ומעקב אישי נשלחים אוטומטית.",
  },
  {
    icon: Shield,
    title: "תשלום מאובטח",
    description: "בטחון מלא לך וללקוחות שלך.",
  },
]

function AnimatedIcon({ Icon }: { Icon: LucideIcon }) {
  const [isVisible, setIsVisible] = useState(false)
  const iconRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.3 },
    )

    if (iconRef.current) {
      observer.observe(iconRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={iconRef} className="relative">
      <Icon
        className={`h-16 w-16 text-foreground ${isVisible ? "animate-draw-icon" : ""}`}
        strokeWidth={1}
        style={{
          strokeDasharray: isVisible ? undefined : 1000,
          strokeDashoffset: isVisible ? undefined : 1000,
        }}
      />
    </div>
  )
}

export function ServicesSection() {
  return (
    <section id="how-it-works" className="relative overflow-hidden px-6 py-32 pb-24">
      <style jsx>{`
        @keyframes drawPath {
          from {
            stroke-dasharray: 1000;
            stroke-dashoffset: 1000;
          }
          to {
            stroke-dasharray: 1000;
            stroke-dashoffset: 0;
          }
        }
        :global(.animate-draw-icon) :global(path),
        :global(.animate-draw-icon) :global(line),
        :global(.animate-draw-icon) :global(polyline),
        :global(.animate-draw-icon) :global(circle),
        :global(.animate-draw-icon) :global(rect) {
          animation: drawPath 2s ease-out forwards;
        }
      `}</style>

      <div className="relative z-10 mx-auto max-w-7xl">
        <FeatureCarousel />

        <div dir="rtl" lang="he" className="font-hero">
          <div className="mb-20 mt-20 text-center">
            <h2 className="mb-6 text-4xl font-normal text-balance md:text-5xl">Caleno מציעה</h2>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              המעטפת המושלמת לצמיחה שלכם
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {keyFeatures.map((feature, index) => (
              <div
                key={index}
                className="group rounded-3xl p-8 text-center transition-colors duration-300 hover:bg-zinc-50"
              >
                <div className="mb-6 flex justify-center">
                  <AnimatedIcon Icon={feature.icon} />
                </div>
                <h3 className="mb-3 text-xl font-medium text-foreground">{feature.title}</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
