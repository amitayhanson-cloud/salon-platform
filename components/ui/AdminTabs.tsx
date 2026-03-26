"use client";

import { useEffect, useRef } from "react";

type TabDef<T extends string> = { key: T; label: string };

interface AdminTabsProps<T extends string> {
  tabs: readonly TabDef<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
  /** Mobile-only horizontal chip design (scrollable, no-wrap). */
  mobileScrollableChips?: boolean;
}

export default function AdminTabs<T extends string>({
  tabs,
  activeKey,
  onChange,
  className,
  mobileScrollableChips = true,
}: AdminTabsProps<T>) {
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!mobileScrollableChips || !activeBtnRef.current) return;
    activeBtnRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeKey, mobileScrollableChips]);

  return (
    <div className={className || ""}>
      <div
        className={
          mobileScrollableChips
            ? "flex w-full min-w-0 gap-2 overflow-x-auto rounded-xl border border-[#E2E8F0]/60 bg-white/40 p-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:gap-1.5 md:rounded-full md:p-1"
            : "flex w-full min-w-0 flex-wrap gap-1.5 rounded-xl border border-[#E2E8F0]/60 bg-white/40 p-1 sm:rounded-full"
        }
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            ref={activeKey === tab.key ? activeBtnRef : null}
            className={
              mobileScrollableChips
                ? `min-h-[38px] flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all touch-manipulation sm:text-sm ${
                    activeKey === tab.key
                      ? "bg-[#1e4e5f] text-white shadow-sm"
                      : "bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e5e7eb]"
                  }`
                : `min-h-[44px] whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-medium transition-all touch-manipulation sm:px-4 md:px-5 ${
                    activeKey === tab.key
                      ? "bg-[#1E6F7C] text-white shadow-sm"
                      : "text-[#64748B] hover:bg-white/60 hover:text-[#1E6F7C]"
                  }`
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
