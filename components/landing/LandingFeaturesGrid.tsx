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
    <section dir="rtl" id="features" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm md:p-8 lg:p-10">
          <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
            {FEATURES_SECTION.headline}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium leading-relaxed text-[#64748B] md:text-lg">
            {FEATURES_SECTION.subtitle}
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {FEATURES_LIST.map((feature) => {
              const Icon = ICON_MAP[feature.icon] ?? Settings;
              return (
                <article
                  key={feature.id}
                  className="rounded-2xl border border-[#E2E8F0] bg-caleno-off/30 p-6 shadow-sm transition duration-200 hover:shadow-md"
                >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[rgba(30,111,124,0.08)] p-3 text-[#1E6F7C]">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 text-right text-lg font-semibold leading-tight text-caleno-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 max-w-[30ch] text-right text-base font-normal leading-relaxed text-[#64748B] md:max-w-none md:text-lg">
                  {feature.description}
                </p>
              </article>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}
