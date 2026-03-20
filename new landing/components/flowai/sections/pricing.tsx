import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
        <p className="mt-2 text-muted-foreground">Start free. Upgrade when your team grows.</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Plan title="Free" price="$0" features={["1 project", "2 collaborators", "Basic features"]} />
        <Plan
          title="Pro"
          price="$12"
          highlight
          features={["Unlimited projects", "10 collaborators", "Priority support"]}
        />
        <Plan
          title="Business"
          price="$29"
          features={["Unlimited projects", "Unlimited collaborators", "SSO & controls"]}
        />
      </div>
    </section>
  )
}

function Plan({
  title,
  price,
  features,
  highlight,
}: {
  title: string
  price: string
  features: string[]
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? "border-rose-300" : ""}>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between">
          <span>{title}</span>
          <span className="text-3xl font-semibold">{price}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 space-y-2 text-sm">
          {features.map((f) => (
            <li key={f} className="text-muted-foreground">
              • {f}
            </li>
          ))}
        </ul>
        <Button asChild className="w-full rounded-full">
          <Link href="/signup">Get Started</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
