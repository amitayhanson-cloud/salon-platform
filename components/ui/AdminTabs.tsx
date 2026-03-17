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
    <div className={className || ""}>
      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl sm:rounded-full bg-white/40 border border-[#E2E8F0]/60 w-full min-w-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`min-h-[44px] px-3 sm:px-4 py-2.5 md:px-5 text-sm font-medium transition-all rounded-full touch-manipulation whitespace-nowrap ${
              activeKey === tab.key
                ? "bg-[#1E6F7C] text-white shadow-sm"
                : "text-[#64748B] hover:bg-white/60 hover:text-[#1E6F7C]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
