"use client"

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useState, useEffect } from "react"
import { Calendar, Wallet } from "lucide-react"

import { LiquidGlassPanel } from "./liquid-glass-panel"
import { RentalsCardShaderBackground } from "./rentals-card-shader-background"

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

const APPOINTMENTS_TODAY = [9, 15, 21, 28]
const REVENUE_TODAY = [1100, 1700, 2200, 2900]

type PanelRow =
  | { label: string; values: readonly [number, number, number] }
  | { label: string; values: readonly [number, number, number]; suffix: string }

const PANEL_ROWS: PanelRow[] = [
  { label: "לקוחות חדשים", values: [29, 36, 41] },
  { label: "ביטולים", values: [1, 3, 4] },
  { label: "ניצולת זמן", values: [88, 91, 93], suffix: "%" },
  { label: "לקוחות", values: [368, 423, 517] },
]

/** Bar chart: active sweep and supporting fills (teal family). */
const BAR_FILL_ACTIVE = "#7ac7d4"
const BAR_FILL_PEAK = "#b0dde4"
const BAR_FILL_MUTED = "#e2eef0"

function useCyclingIndex(length: number, intervalMs: number) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % length), intervalMs)
    return () => clearInterval(id)
  }, [length, intervalMs])
  return i
}

export function RealtimePropertyCard() {
  const reduceMotion = useReducedMotion()
  const appointmentsIdx = useCyclingIndex(APPOINTMENTS_TODAY.length, 2100)
  const revenueIdx = useCyclingIndex(REVENUE_TODAY.length, 2780)
  const newClientsIdx = useCyclingIndex(3, 2320)
  const cancellationsIdx = useCyclingIndex(3, 3050)
  const utilizationIdx = useCyclingIndex(3, 2640)
  const clientsIdx = useCyclingIndex(3, 2890)

  const panelIndices = [newClientsIdx, cancellationsIdx, utilizationIdx, clientsIdx]

  const [hourlyData, setHourlyData] = useState(defaultHourlyData)
  const [highlightedBar, setHighlightedBar] = useState(8)

  const maxVisitors = Math.max(...hourlyData.map((d) => d.visitors))

  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightedBar((prev) => (prev + 1) % hourlyData.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [hourlyData.length])

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      viewport={{ once: true }}
      className="w-full"
    >
      <LiquidGlassPanel
        tone="light"
        contentClassName="p-6"
        withGlareDecorations={false}
        behindContent={reduceMotion ? undefined : <RentalsCardShaderBackground />}
      >
        <div dir="rtl" lang="he" className="mb-6 flex items-center gap-3">
          <h3 className="text-lg font-semibold text-zinc-100 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            פעילות יומית
          </h3>
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        </div>

        <div dir="rtl" lang="he" className="mb-6 grid grid-cols-2 gap-4">
          <motion.div
            className="rounded-xl p-4"
            style={{ backgroundColor: "#3c7a8d" }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="mb-1 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-white/90" />
              <p className="text-sm font-medium text-white/95">תורים היום</p>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={appointmentsIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-3xl font-bold text-white"
              >
                {APPOINTMENTS_TODAY[appointmentsIdx]}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          <motion.div
            className="rounded-xl p-4"
            style={{ backgroundColor: "#417374" }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="mb-1 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-white/90" />
              <p className="text-sm font-medium text-white/95">הכנסות היום</p>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={revenueIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-3xl font-bold tracking-tight text-white"
              >
                {REVENUE_TODAY[revenueIdx].toLocaleString("he-IL")}₪
              </motion.p>
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="mb-6">
          <p
            dir="rtl"
            lang="he"
            className="mb-3 text-sm font-medium text-zinc-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.5)]"
          >
            צפיות היום
          </p>
          <div className="h-32 bg-transparent">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} style={{ background: "transparent" }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: "#cbd5e1" }}
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
                  {hourlyData.map((row, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        index === highlightedBar
                          ? BAR_FILL_ACTIVE
                          : row.visitors === maxVisitors
                            ? BAR_FILL_PEAK
                            : BAR_FILL_MUTED
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div dir="rtl" lang="he">
          <p className="mb-3 text-sm font-medium text-zinc-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.5)]">
            פאנל ניהול
          </p>
          <div className="space-y-2">
            {PANEL_ROWS.map((row, index) => {
              const idx = panelIndices[index] ?? 0
              const v = row.values[idx % row.values.length]
              const display = "suffix" in row && row.suffix ? `${v}${row.suffix}` : String(v)
              return (
                <motion.div
                  key={row.label}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ backgroundColor: "#f1f5f9", x: -4 }}
                >
                  <span className="text-sm text-slate-600">{row.label}</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={display}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-sm font-medium text-slate-900 tabular-nums"
                    >
                      {display}
                    </motion.span>
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </div>
      </LiquidGlassPanel>
    </motion.div>
  )
}
