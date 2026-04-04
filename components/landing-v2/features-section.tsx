"use client"

import { Check } from "lucide-react"
import { motion } from "framer-motion"
import { FEATURES_SECTION_BACKGROUND } from "./features-section-background"
import { LiquidGlassPanel } from "./liquid-glass-panel"
import { RealtimePropertyCard } from "./realtime-property-card"

const features = [
  "Create a listing in 5 minutes",
  "Profile verification included",
  "Instant messaging",
  "24/7 support",
  "No hidden fees",
  "Secure payment",
]

export function FeaturesSection() {
  return (
    <section id="features" className="relative overflow-hidden px-6 py-32">
      <div className={FEATURES_SECTION_BACKGROUND} aria-hidden />
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-center pointer-events-none z-0">
        <span className="font-bold text-center text-[20vw] sm:text-[18vw] md:text-[16vw] lg:text-[14vw] leading-none tracking-tighter text-zinc-100 whitespace-nowrap">
          MANAGE
        </span>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <RealtimePropertyCard />
          </div>

          <div className="order-1 lg:order-2 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-5xl font-normal mb-6 text-balance font-serif">
                Manage your rentals with ease
              </h2>
              <p className="text-muted-foreground leading-relaxed text-lg">
                Track your income, manage reservations, and communicate with tenants from a single intuitive and modern
                interface.
              </p>
            </motion.div>

            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <LiquidGlassPanel tone="light" contentClassName="flex items-center gap-2 py-3 pe-3 ps-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-md">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-sm text-foreground [text-shadow:0_1px_0_rgba(255,255,255,0.88)]">
                      {feature}
                    </span>
                  </LiquidGlassPanel>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
