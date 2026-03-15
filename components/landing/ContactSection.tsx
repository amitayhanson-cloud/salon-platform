import { CONTACT_SECTION } from "@/lib/landingContent";

export function ContactSection() {
  return (
    <section dir="rtl" id="contact" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm md:p-8 lg:p-10">
          <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
            {CONTACT_SECTION.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium leading-relaxed text-[#64748B] md:text-lg">
            {CONTACT_SECTION.subtitle}
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href="mailto:hello@caleno.co"
              className="inline-flex min-w-[180px] items-center justify-center rounded-full border border-[#E2E8F0] bg-white px-6 py-4 text-base font-medium text-caleno-ink transition-colors hover:bg-caleno-off sm:w-auto"
            >
              {CONTACT_SECTION.buttonLabel}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
