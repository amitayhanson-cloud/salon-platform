import { TRUST } from "@/lib/landingContent";

export function TrustSection() {
  return (
    <section className="border-y border-gray-200 bg-gray-50 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="mb-8 text-center text-sm font-medium text-gray-500 sm:mb-10" dir="rtl">
          {TRUST.line}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          {TRUST.logos.map((name) => (
            <div
              key={name}
              className="flex h-10 w-24 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-medium text-gray-400"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
