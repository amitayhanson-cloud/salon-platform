"use client"

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect } from "react"
import { Home, Eye } from "lucide-react"

const defaultHourlyData = [
  { hour: "12am", visitors: 120 },
  { hour: "2am", visitors: 80 },
  { hour: "4am", visitors: 45 },
  { hour: "6am", visitors: 90 },
  { hour: "8am", visitors: 280 },
  { hour: "10am", visitors: 420 },
  { hour: "12pm", visitors: 380 },
  { hour: "2pm", visitors: 450 },
  { hour: "4pm", visitors: 520 },
  { hour: "6pm", visitors: 480 },
  { hour: "8pm", visitors: 350 },
  { hour: "10pm", visitors: 220 },
]

const defaultTopProperties = [
  { page: "Paris Apartment", visitors: 245 },
  { page: "Côte d'Azur Villa", visitors: 189 },
  { page: "Lyon Studio", visitors: 156 },
  { page: "Bordeaux House", visitors: 98 },
]

export function RealtimePropertyCard() {
  const [currentVisitors, setCurrentVisitors] = useState(847)
  const [pageViews, setPageViews] = useState(3420)
  const [hourlyData, setHourlyData] = useState(defaultHourlyData)
  const [topProperties, setTopProperties] = useState(defaultTopProperties)
  const [highlightedBar, setHighlightedBar] = useState(8)

  const maxVisitors = Math.max(...hourlyData.map((d) => d.visitors))

  // Animate visitor count
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentVisitors((prev) => prev + Math.floor(Math.random() * 10) - 3)
      setPageViews((prev) => prev + Math.floor(Math.random() * 5))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // Animate bar highlight
  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightedBar((prev) => (prev + 1) % hourlyData.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [hourlyData.length])

  // Update hourly data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setHourlyData((prev) =>
        prev.map((item) => ({
          ...item,
          visitors: Math.max(30, item.visitors + Math.floor(Math.random() * 40) - 20),
        })),
      )
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Update top properties periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTopProperties((prev) =>
        prev.map((item) => ({
          ...item,
          visitors: Math.max(50, item.visitors + Math.floor(Math.random() * 20) - 10),
        })),
      )
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      viewport={{ once: true }}
      className="w-full rounded-2xl bg-white p-6"
      style={{
        boxShadow:
          "rgba(14, 63, 126, 0.04) 0px 0px 0px 1px, rgba(42, 51, 69, 0.04) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.04) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.04) 0px 6px 6px -3px, rgba(14, 63, 126, 0.04) 0px 12px 12px -6px, rgba(14, 63, 126, 0.04) 0px 24px 24px -12px",
      }}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Property Activity</h3>
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        </div>
        <span className="text-sm text-slate-500">Live</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <motion.div
          className="rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 p-4 text-black"
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 opacity-60" />
            <p className="text-sm opacity-80">Viewing Now</p>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={currentVisitors}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-3xl font-bold"
            >
              {currentVisitors.toLocaleString()}
            </motion.p>
          </AnimatePresence>
        </motion.div>
        <motion.div
          className="rounded-xl bg-gradient-to-br from-violet-100 to-purple-200 p-4 text-black"
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Home className="w-4 h-4 opacity-60" />
            <p className="text-sm opacity-80">Property Views</p>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={pageViews}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-3xl font-bold"
            >
              {pageViews.toLocaleString()}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-slate-700">Views Today</p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="visitors" radius={[4, 4, 0, 0]}>
                {hourlyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === highlightedBar ? "#3b82f6" : entry.visitors === maxVisitors ? "#60a5fa" : "#e2e8f0"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-slate-700">Trending Properties</p>
        <div className="space-y-2">
          {topProperties.map((property, index) => (
            <motion.div
              key={index}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ backgroundColor: "#f1f5f9", x: 4 }}
            >
              <span className="text-sm text-slate-600">{property.page}</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={property.visitors}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-sm font-medium text-slate-900"
                >
                  {property.visitors}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
