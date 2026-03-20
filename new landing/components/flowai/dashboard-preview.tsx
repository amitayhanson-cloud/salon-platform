"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Plus,
  Check,
  DollarSign,
  ScanSearch,
  Timer,
  Hourglass,
  FolderKanban,
  CheckCircle2,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast" // Import useToast

type ProjectStatus = "ongoing" | "pending" | "completed"
type Project = {
  id: number
  name: string
  status: ProjectStatus
  paid: boolean
}

const initialProjects: Project[] = [
  { id: 1, name: "Website Redesign", status: "ongoing", paid: false },
  { id: 2, name: "Mobile App MVP", status: "pending", paid: false },
  { id: 3, name: "Client Onboarding", status: "completed", paid: true },
]

export function DashboardPreview() {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const { toast } = useToast() // Declare useToast

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  )

  const stats = useMemo(() => {
    const total = projects.length
    const ongoing = projects.filter((p) => p.status === "ongoing").length
    const pending = projects.filter((p) => p.status === "pending").length
    const completed = projects.filter((p) => p.status === "completed").length
    const paid = projects.filter((p) => p.paid).length
    return { total, ongoing, pending, completed, paid }
  }, [projects])

  function addProject() {
    if (!newName.trim()) return
    setProjects((prev) => [{ id: Date.now(), name: newName.trim(), status: "ongoing", paid: false }, ...prev])
    setNewName("")
    setOpen(false)
    toast({ title: "Project added", description: "Your new project was created." })
  }

  function toggleStatus(id: number) {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const order: ProjectStatus[] = ["pending", "ongoing", "completed"]
        const idx = order.indexOf(p.status)
        const next = order[(idx + 1) % order.length]
        return { ...p, status: next }
      }),
    )
  }

  function togglePaid(id: number) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)))
  }

  return (
    <section className="-mt-10">
      <div className={cn("relative mx-auto max-w-5xl overflow-hidden rounded-3xl border bg-white shadow-md")}>
        {/* top bar */}
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white text-[10px] font-semibold">
              {"✺"}
            </div>
            <span className="font-semibold">FlowAI</span>
          </div>

          <div className="hidden w-72 items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-sm sm:flex">
            <ScanSearch className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="h-6 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add new project
            </Button>
            <div className="h-7 w-7 rounded-full bg-muted" aria-hidden />
          </div>
        </div>

        {/* content grid */}
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          <StatCard
            title="Ongoing Projects"
            value={String(stats.ongoing)}
            icon={Timer}
            iconClass="bg-amber-100 text-amber-600"
          />
          <StatCard
            title="Pending Projects"
            value={String(stats.pending)}
            icon={Hourglass}
            iconClass="bg-zinc-100 text-zinc-600"
          />
          <StatCard
            title="Total Projects"
            value={String(stats.total)}
            icon={FolderKanban}
            iconClass="bg-sky-100 text-sky-600"
          />
          <StatCard
            title="Completed Projects"
            value={String(stats.completed)}
            icon={CheckCircle2}
            iconClass="bg-emerald-100 text-emerald-600"
          />
          <StatCard
            title="Payments Completed"
            value={String(stats.paid)}
            icon={CircleDollarSign}
            iconClass="bg-rose-100 text-rose-600"
          />

          <div className="rounded-2xl border bg-muted/30 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground">Ongoing Projects List</span>
              <Badge variant="secondary">{filtered.length}</Badge>
            </div>

            <div className="mt-2 space-y-2">
              {filtered.length === 0 ? (
                <div className="grid h-24 place-items-center rounded-lg border bg-white text-muted-foreground">
                  No projects
                </div>
              ) : (
                filtered.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          p.status === "completed"
                            ? "bg-emerald-500"
                            : p.status === "ongoing"
                              ? "bg-amber-500"
                              : "bg-slate-400",
                        )}
                        aria-hidden
                      />
                      <div className="text-sm">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{p.status}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => toggleStatus(p.id)}
                        title="Cycle status"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={p.paid ? "default" : "outline"}
                        className={cn("h-8 w-8", p.paid ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : "")}
                        onClick={() => togglePaid(p.id)}
                        title="Toggle paid"
                      >
                        <DollarSign className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name" autoFocus />
            <p className="text-xs text-muted-foreground">
              Projects start as “ongoing”. You can cycle status and mark as paid from the list.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={addProject} className="rounded-full">
              <Plus className="mr-1 h-4 w-4" /> Add project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconClass,
}: {
  title: string
  value: string
  icon: LucideIcon
  iconClass?: string
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-2 inline-flex items-center gap-2">
        <div className={cn("grid h-6 w-6 place-items-center rounded-md", iconClass || "bg-rose-100 text-rose-600")}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
