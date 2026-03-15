import Link from "next/link";
import { FINAL_CTA } from "@/lib/landingContent";

export function FinalCtaSection() {
  return (
    <section dir="rtl" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 text-center shadow-sm md:p-10 lg:p-12">
          <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
            {FINAL_CTA.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base font-medium leading-relaxed text-[#64748B] md:text-lg">
            {FINAL_CTA.subline}
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/signup"
              className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-caleno-deep px-8 py-4 text-base font-medium text-white shadow-sm transition-colors hover:bg-caleno-600 sm:w-auto"
            >
              {FINAL_CTA.buttonLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
