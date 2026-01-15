"use client";

interface AdminTabsProps {
  tabs: Array<{ key: string; label: string }>;
  activeKey: string;
  onChange: (key: string) => void;
}

export function AdminTabs({ tabs, activeKey, onChange }: AdminTabsProps) {
  return (
    <div className="border-b border-slate-200 mb-6">
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
