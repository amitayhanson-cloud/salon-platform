import { CONTACT_SECTION } from "@/lib/landingContent";

export function ContactSection() {
  return (
    <section
      dir="rtl"
      id="contact"
      className="border-t border-gray-200 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {CONTACT_SECTION.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
          {CONTACT_SECTION.subtitle}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href="mailto:hello@caleno.co"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            {CONTACT_SECTION.buttonLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
