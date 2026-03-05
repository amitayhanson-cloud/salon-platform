import { CONTACT_SECTION } from "@/lib/landingContent";

export function ContactSection() {
  return (
    <section
      dir="rtl"
      id="contact"
      className="border-t border-gray-200 py-12 md:py-16"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-[clamp(24px,4vw,40px)] font-bold leading-tight tracking-tight text-gray-900">
          {CONTACT_SECTION.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[clamp(14px,2.2vw,18px)] text-slate-600">
          {CONTACT_SECTION.subtitle}
        </p>
        <div className="mt-8 flex justify-center">
          <a
            href="mailto:hello@caleno.co"
            className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            {CONTACT_SECTION.buttonLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
