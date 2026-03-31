"use client"

import { Check } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { RealtimePropertyCard } from "./realtime-property-card"

const features = [
  "Create a listing in 5 minutes",
  "Profile verification included",
  "Instant messaging",
  "24/7 support",
  "No hidden fees",
  "Secure payment",
]

const allTransactions = [
  { name: "Côte d'Azur Villa", amount: "+$2,400", category: "Rental received", color: "from-emerald-400 to-teal-500" },
  { name: "Paris 11 Apartment", amount: "+$1,850", category: "Rental received", color: "from-blue-400 to-indigo-500" },
  { name: "Bordeaux House", amount: "+$1,200", category: "Rental received", color: "from-amber-400 to-orange-500" },
  { name: "Chamonix Chalet", amount: "+$3,500", category: "Rental received", color: "from-rose-400 to-pink-500" },
  { name: "Lyon Studio", amount: "+$750", category: "Rental received", color: "from-violet-400 to-purple-500" },
  { name: "Marseille Loft", amount: "+$1,100", category: "Rental received", color: "from-cyan-400 to-blue-500" },
  { name: "Provence Farmhouse", amount: "+$2,800", category: "Rental received", color: "from-lime-400 to-green-500" },
  { name: "Lille Duplex", amount: "+$950", category: "Rental received", color: "from-fuchsia-400 to-pink-500" },
]

export function FeaturesSection() {
  const [balance, setBalance] = useState(12458.32)
  const [monthlyGrowth] = useState(23.5)
  const scrollRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const scrollPosition = useRef(0)
  const lastUpdateTime = useRef(0)

  const tripleTransactions = [...allTransactions, ...allTransactions, ...allTransactions]

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!scrollRef.current) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      if (!lastUpdateTime.current) lastUpdateTime.current = timestamp
      const deltaTime = timestamp - lastUpdateTime.current
      lastUpdateTime.current = timestamp

      scrollPosition.current += (deltaTime / 1000) * 35

      const singleSetHeight = scrollRef.current.scrollHeight / 3

      if (scrollPosition.current >= singleSetHeight) {
        scrollPosition.current = 0

        const randomTransaction = allTransactions[Math.floor(Math.random() * allTransactions.length)]
        const amount = Number.parseFloat(randomTransaction.amount.replace(/[$,]/g, ""))
        setBalance((prev) => prev + amount)
      }

      scrollRef.current.style.transform = `translateY(-${scrollPosition.current}px)`
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <section id="features" className="py-32 px-6 relative overflow-hidden">
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

            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-center p-3 rounded-xl hover:bg-zinc-50 transition-colors duration-300 gap-2 py-1"
                >
                  <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-sm text-foreground">{feature}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
