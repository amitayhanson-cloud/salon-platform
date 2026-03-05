import { TRUST } from "@/lib/landingContent";

export function TrustSection() {
  return (
    <section className="border-y border-gray-200 bg-gray-50 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <p className="mx-auto mb-8 max-w-2xl text-center text-sm font-medium text-gray-500 md:mb-10 md:text-base" dir="rtl">
          {TRUST.line}
        </p>
        <div className="grid grid-cols-2 gap-4 md:flex md:flex-wrap md:items-center md:justify-center md:gap-8 lg:gap-12">
          {TRUST.logos.map((name) => (
            <div
              key={name}
              className="flex h-12 w-full min-w-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-medium text-gray-400 md:h-10 md:w-24"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
