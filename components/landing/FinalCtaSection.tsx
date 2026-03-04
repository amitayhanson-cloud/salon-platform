import Link from "next/link";
import { FINAL_CTA } from "@/lib/landingContent";

export function FinalCtaSection() {
  return (
    <section dir="rtl" className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-16 text-center shadow-sm sm:px-12 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
            {FINAL_CTA.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-gray-600">
            {FINAL_CTA.subline}
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-gray-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-800"
          >
            {FINAL_CTA.buttonLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
