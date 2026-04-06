"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PhoneMockupFrameProps = {
  children?: ReactNode;
  /**
   * When set, the site preview loads in an iframe so CSS viewport / Tailwind breakpoints
   * use the phone’s width (~390px), not the outer desktop window (fixes cramped desktop mockups).
   */
  iframeSrc?: string;
  iframeTitle?: string;
  className?: string;
};

/**
 * Device frame for template live preview. Portrait shell uses aspect-ratio 9/19 with
 * max-height 75vh (90vh from `sm:`) so the full device fits on mobile; site scrolls inside the screen.
 */
export function PhoneMockupFrame({
  children,
  iframeSrc,
  iframeTitle = "תצוגה חיה",
  className,
}: PhoneMockupFrameProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full max-w-full flex-1 items-center justify-center py-1 sm:py-3",
        className
      )}
    >
      {/* Outer scale wrapper: shrink entire device on very small widths */}
      <div className="flex max-h-[75vh] w-full max-w-full origin-center items-center justify-center max-[380px]:scale-[0.92] sm:max-h-[90vh] sm:scale-100">
        <div
          className={cn(
            "flex w-[min(100%,min(390px,calc(75vh*9/19)))] max-w-full flex-col [aspect-ratio:9/19]",
            "max-h-[75vh] min-h-0",
            "sm:w-[min(390px,calc(90vh*9/19))] sm:max-h-[90vh]"
          )}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col rounded-[2.65rem] p-[7px] shadow-[0_28px_80px_-20px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)]",
              "bg-gradient-to-b from-[#3a3a3c] via-[#2c2c2e] to-[#1c1c1e] ring-1 ring-black/50",
              "sm:p-[9px]"
            )}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[2.35rem] bg-[#0a0a0a] p-[2px] sm:p-[3px]">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[2.05rem] bg-black sm:rounded-[2.1rem]">
                <div className="relative flex h-9 shrink-0 items-end justify-center bg-black pb-1 pt-1.5 sm:h-11 sm:pb-1.5 sm:pt-2">
                  <div className="h-[22px] w-[76px] rounded-full bg-[#0a0a0a] shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08] sm:h-[26px] sm:w-[88px]" />
                </div>
                {iframeSrc ? (
                  <div className="relative min-h-0 min-w-0 flex-1">
                    <iframe
                      title={iframeTitle}
                      src={iframeSrc}
                      className="absolute inset-0 h-full w-full border-0 bg-black"
                      sandbox="allow-scripts allow-same-origin"
                      loading="eager"
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
                      "[scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]",
                      "touch-pan-y"
                    )}
                  >
                    <div
                      inert
                      className="pointer-events-none min-w-0 select-none [overflow-anchor:none]"
                    >
                      {children}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
