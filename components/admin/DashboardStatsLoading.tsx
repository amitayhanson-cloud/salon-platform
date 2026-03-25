"use client";

import Image from "next/image";
import { CALENO_HELP_THINKING_CSS } from "@/components/admin/calenoHelpThinkingStyles";

const HELP_BOT_ICON = "/brand/caleno%20logo/Untitled%20design%20(2).svg";

/**
 * Dashboard stats area: small Caleno bot + “gathering data” copy while metrics load.
 */
export function DashboardStatsLoading() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CALENO_HELP_THINKING_CSS }} />
      <div
        className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-[#E2E8F0] bg-gradient-to-b from-white to-[rgba(204,238,241,0.12)] px-6 py-10"
        role="status"
        aria-live="polite"
        aria-label="אוספים נתונים ללוח הבקרה"
      >
        <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center">
          <span
            className="caleno-help-thinking-ring absolute inset-[-4px] rounded-2xl bg-caleno-deep/20"
            aria-hidden
          />
          <span
            className="caleno-help-thinking-ring absolute inset-[-4px] rounded-2xl bg-caleno-400/18"
            style={{ animationDelay: "0.5s" }}
            aria-hidden
          />
          <div className="caleno-help-thinking-avatar relative z-[1] h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-md ring-2 ring-white">
            <Image
              src={HELP_BOT_ICON}
              alt=""
              width={44}
              height={44}
              className="h-full w-full object-contain p-0.5"
              unoptimized
            />
          </div>
        </div>

        <div className="max-w-sm space-y-2 text-center">
          <p className="caleno-help-thinking-label text-base font-semibold leading-snug">
            אוספים מידע מהמערכת…
          </p>
          <p className="text-sm leading-relaxed text-[#64748B]">
            זה עלול לקחת רגע.
          </p>
          <div className="flex items-end justify-center gap-1.5 pt-1" dir="ltr" aria-hidden>
            {[0, 1, 2, 3].map((j) => (
              <span
                key={j}
                className="caleno-help-thinking-dot h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-caleno-deep to-caleno-500 shadow-sm"
                style={{ animationDelay: `${j * 0.14}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
