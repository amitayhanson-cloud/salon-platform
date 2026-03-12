"use client";

type TabDef<T extends string> = { key: T; label: string };

interface AdminTabsProps<T extends string> {
  tabs: readonly TabDef<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export default function AdminTabs<T extends string>({
    tabs,
    activeKey,
    onChange,
    className,
  }: AdminTabsProps<T>) {
  
  return (
    <div className={`border-b border-[#E2E8F0] ${className || ""}`}>
      <div className="flex gap-2 md:gap-4 overflow-x-auto -mb-px scrollbar-thin scrollbar-thumb-slate-200" style={{ scrollbarWidth: "thin" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-shrink-0 px-3 py-2 md:px-4 text-sm font-medium transition-colors border-b-2 touch-manipulation whitespace-nowrap ${
              activeKey === tab.key
                ? "border-[#1E6F7C] text-[#1E6F7C] font-semibold"
                : "border-transparent text-[#64748B] hover:text-[#1E6F7C]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
