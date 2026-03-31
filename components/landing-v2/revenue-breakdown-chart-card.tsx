"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

export interface RevenueBreakdownChartCardProps {
  title?: string
  period?: string
  data?: Array<{
    name: string
    value: number
    color: string
  }>
  totalRevenue?: number
  growth?: number
}

const defaultData = [
  { name: "Products", value: 45000, color: "#3b82f6" },
  { name: "Services", value: 28000, color: "#10b981" },
  { name: "Subscriptions", value: 18000, color: "#8b5cf6" },
  { name: "Licensing", value: 9000, color: "#f59e0b" },
]

export function RevenueBreakdownChartCard({
  title = "Revenue Breakdown",
  period = "This Quarter",
  data = defaultData,
  totalRevenue = 100000,
  growth = 12.5,
}: RevenueBreakdownChartCardProps) {
  return (
    <div
      className="w-full rounded-2xl bg-white p-6"
      style={{
        boxShadow:
          "rgba(14, 63, 126, 0.04) 0px 0px 0px 1px, rgba(42, 51, 69, 0.04) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.04) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.04) 0px 6px 6px -3px, rgba(14, 63, 126, 0.04) 0px 12px 12px -6px, rgba(14, 63, 126, 0.04) 0px 24px 24px -12px",
      }}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{period}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">${totalRevenue.toLocaleString()}</p>
          <p className={`text-sm font-medium ${growth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {growth >= 0 ? "+" : ""}
            {growth}% vs last period
          </p>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => <span className="text-slate-600 text-xs">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-sm text-slate-600">{item.name}</span>
            <span className="ml-auto text-sm font-medium text-slate-900">
              {((item.value / totalRevenue) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
