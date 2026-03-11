import {
  HOW_IT_WORKS_SECTION,
  HOW_IT_WORKS_STEPS,
} from "@/lib/landingContent";

export function HowItWorksSection() {
  return (
    <section
      dir="rtl"
      id="how-it-works"
      className="py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
          {HOW_IT_WORKS_SECTION.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium leading-relaxed text-gray-500 md:text-lg">
          {HOW_IT_WORKS_SECTION.subtitle}
        </p>

        <div className="mt-12 flex flex-col gap-8 md:flex-row md:items-start md:justify-between md:gap-8 lg:gap-12">
          {HOW_IT_WORKS_STEPS.map((item, index) => (
            <div
              key={item.step}
              className="relative flex flex-1 flex-col items-center text-center md:items-start md:text-right"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-caleno-ink bg-white text-lg font-semibold leading-tight text-caleno-ink">
                {item.step}
              </div>
              {index < HOW_IT_WORKS_STEPS.length - 1 && (
                <>
                  <div
                    className="mt-2 h-8 w-0.5 flex-shrink-0 bg-gray-200 md:hidden"
                    aria-hidden
                  />
                  <div
                    className="absolute left-1/2 top-6 hidden h-0.5 w-full -translate-x-1/2 bg-gray-200 md:block md:left-6 md:top-6 md:w-[calc(100%-3rem)] md:translate-x-0"
                    aria-hidden
                  />
                </>
              )}
              <h3 className="mt-4 text-lg font-semibold leading-tight text-caleno-ink">
                {item.title}
              </h3>
              <p className="mx-auto mt-2 max-w-[60ch] font-normal leading-relaxed text-gray-500 md:mx-0 md:max-w-none">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
