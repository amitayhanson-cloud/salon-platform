import {
  Calendar,
  Users,
  CreditCard,
  MessageCircle,
  Settings,
  Globe,
} from "lucide-react";
import { FEATURES_LIST, FEATURES_SECTION } from "@/lib/landingContent";

const ICON_MAP = {
  calendar: Calendar,
  users: Users,
  "credit-card": CreditCard,
  "message-circle": MessageCircle,
  settings: Settings,
  globe: Globe,
} as const;

export function LandingFeaturesGrid() {
  return (
    <section dir="rtl" id="features" className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {FEATURES_SECTION.headline}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
          {FEATURES_SECTION.subtitle}
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES_LIST.map((feature) => {
            const Icon = ICON_MAP[feature.icon] ?? Settings;
            return (
              <article
                key={feature.id}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 text-right text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-right text-gray-600">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
