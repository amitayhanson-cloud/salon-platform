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
    <div className={`border-b border-[#E2E8F0] mb-6 ${className || ""}`}>
      <div className="flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
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
