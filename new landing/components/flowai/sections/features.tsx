import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function FeaturesSection() {
  const features = [
    { title: "Plan in minutes", desc: "Create projects, assign tasks, and set timelines fast." },
    { title: "Track progress", desc: "Status at a glance with auto-updating boards." },
    { title: "Collaborate", desc: "Keep your team aligned with comments and mentions." },
  ]
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Features</h2>
        <p className="mt-2 text-muted-foreground">
          Everything you need to keep projects on track—without the busywork.
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="rounded-2xl">
            <CardHeader>
              <CardTitle>{f.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
