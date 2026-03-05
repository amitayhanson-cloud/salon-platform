import { TRUST } from "@/lib/landingContent";

export function TrustSection() {
  return (
    <section className="border-y border-gray-200 bg-gray-50 py-16 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="mb-8 text-center text-sm font-medium text-gray-500 sm:mb-10" dir="rtl">
          {TRUST.line}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-8 md:gap-12">
          {TRUST.logos.map((name) => (
            <div
              key={name}
              className="flex h-12 w-full min-w-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-medium text-gray-400 sm:h-10 sm:w-24"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
