import Link from "next/link";
import { FINAL_CTA } from "@/lib/landingContent";

export function FinalCtaSection() {
  return (
    <section dir="rtl" className="bg-white py-16 md:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-gray-200 bg-caleno-off p-6 text-center shadow-sm md:p-10">
          <h2 className="text-center text-[clamp(24px,4vw,40px)] font-semibold leading-tight tracking-tight text-caleno-ink">
            {FINAL_CTA.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[clamp(14px,2.2vw,18px)] font-medium leading-relaxed text-gray-500">
            {FINAL_CTA.subline}
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/signup"
              className="inline-flex w-full items-center justify-center rounded-xl bg-caleno-ink px-8 py-3.5 text-base font-medium leading-normal text-white shadow-sm transition-all duration-200 hover:bg-[#1F2937] hover:-translate-y-px hover:shadow-md active:translate-y-0 sm:w-auto"
            >
              {FINAL_CTA.buttonLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
