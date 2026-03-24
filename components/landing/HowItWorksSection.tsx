import {
  HOW_IT_WORKS_SECTION,
  HOW_IT_WORKS_STEPS,
} from "@/lib/landingContent";

export function HowItWorksSection() {
  return (
    <section dir="rtl" id="how-it-works" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm md:p-8 lg:p-10">
          <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
            {HOW_IT_WORKS_SECTION.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium leading-relaxed text-[#64748B] md:text-lg">
            {HOW_IT_WORKS_SECTION.subtitle}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-8 lg:gap-12">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div
                key={item.step}
                className="relative flex h-full flex-col items-center rounded-2xl border border-[#E2E8F0] bg-caleno-off/30 p-6 text-center shadow-sm md:items-start md:text-right"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-caleno-deep bg-white text-lg font-semibold leading-tight text-caleno-deep">
                  {item.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold leading-tight text-caleno-ink">
                  {item.title}
                </h3>
                <p className="mx-auto mt-2 max-w-[60ch] font-normal leading-relaxed text-[#64748B] md:mx-0 md:max-w-none">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
