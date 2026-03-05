import Link from "next/link";
import { FINAL_CTA } from "@/lib/landingContent";

export function FinalCtaSection() {
  return (
    <section dir="rtl" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center shadow-sm md:p-10">
          <h2 className="text-center text-[clamp(24px,4vw,40px)] font-bold leading-tight tracking-tight text-gray-900">
            {FINAL_CTA.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[clamp(14px,2.2vw,18px)] text-slate-600">
            {FINAL_CTA.subline}
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/signup"
              className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-800 sm:w-auto"
            >
              {FINAL_CTA.buttonLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
