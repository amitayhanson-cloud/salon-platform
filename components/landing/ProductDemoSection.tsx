"use client";

import { useState } from "react";
import { DEMO_SECTION, DEMO_TABS } from "@/lib/landingContent";

type DemoTabId = (typeof DEMO_TABS)[number]["id"];

export function ProductDemoSection() {
  const [activeTab, setActiveTab] = useState<DemoTabId>(DEMO_TABS[0].id);
  const activeLabel = DEMO_TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <section
      dir="rtl"
      className="border-t border-gray-200 bg-gray-50 py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          {DEMO_SECTION.headline}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base text-gray-600 md:text-lg">
          {DEMO_SECTION.subtitle}
        </p>

        <div className="mt-10">
          <div
            className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm scroll-smooth px-4 md:justify-center md:overflow-visible md:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="תפריט דמו מוצר"
          >
            {DEMO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`demo-panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] min-w-[110px] shrink-0 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium transition-colors md:min-w-0 md:flex-1 md:px-5 ${
                  activeTab === tab.id
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-center text-sm text-gray-500" dir="rtl">
            תצוגה לדוגמה
          </p>
          <div
            id={`demo-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="mt-2 rounded-2xl border border-gray-200 bg-white shadow-md"
          >
            <div className="flex h-[240px] items-center justify-center md:h-[360px]">
              <span className="text-right text-gray-400">
                {activeLabel} {DEMO_SECTION.placeholderSuffix}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
