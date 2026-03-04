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
      className="border-t border-gray-200 bg-gray-50 py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {DEMO_SECTION.headline}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
          {DEMO_SECTION.subtitle}
        </p>

        <div className="mt-10">
          <div
            className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
            role="tablist"
            aria-label="Product demo tabs"
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
                className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors sm:px-6 ${
                  activeTab === tab.id
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            id={`demo-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-md"
          >
            <div className="flex h-64 items-center justify-center sm:h-80 lg:h-96">
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
