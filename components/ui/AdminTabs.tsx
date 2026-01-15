"use client";

type TabDef<T extends string> = { key: T; label: string };

interface AdminTabsProps<T extends string> {
  tabs: TabDef<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export function AdminTabs<T extends string>({ tabs, activeKey, onChange, className }: AdminTabsProps<T>) {
  return (
    <div className={`border-b border-slate-200 mb-6 ${className || ""}`}>
      <div className="flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeKey === tab.key
                ? "border-sky-500 text-sky-700 font-semibold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
