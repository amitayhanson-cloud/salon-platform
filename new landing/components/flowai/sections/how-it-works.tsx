import { Badge } from "@/components/ui/badge"

export default function HowItWorksSection() {
  const steps = [
    { n: 1, title: "Create a project", desc: "Start with a goal, due date, and team." },
    { n: 2, title: "Add tasks and owners", desc: "Break work down and assign owners." },
    { n: 3, title: "Track and adapt", desc: "Watch progress, adjust scope, and ship on time." },
  ]
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight">How it Works</h2>
        <p className="mt-2 text-muted-foreground">Three simple steps from idea to done.</p>
      </div>
      <ol className="mx-auto mt-8 grid max-w-3xl gap-4">
        {steps.map((s) => (
          <li key={s.n} className="flex items-start gap-3 rounded-2xl border p-4">
            <Badge className="rounded-full">{s.n}</Badge>
            <div>
              <div className="font-medium">{s.title}</div>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
