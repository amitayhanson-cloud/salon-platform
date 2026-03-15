"use client";

import { useState } from "react";
import Image from "next/image";
import { DEMO_SECTION, DEMO_TABS } from "@/lib/landingContent";

type DemoTabId = (typeof DEMO_TABS)[number]["id"];

/** Per-tab image URLs for the 3 demo tabs (calendar, clients, website). */
type ProductDemoSectionProps = {
  calendarImageUrl?: string | null;
  clientsImageUrl?: string | null;
  /** Tab 3: "האתר שלכם" — client website preview image. */
  whatsappImageUrl?: string | null;
};

export function ProductDemoSection({
  calendarImageUrl,
  clientsImageUrl,
  whatsappImageUrl,
}: ProductDemoSectionProps) {
  const [activeTab, setActiveTab] = useState<DemoTabId>(DEMO_TABS[0].id);
  const activeLabel = DEMO_TABS.find((t) => t.id === activeTab)?.label ?? "";
  const activeImageUrl =
    activeTab === "calendar"
      ? calendarImageUrl
      : activeTab === "clients"
        ? clientsImageUrl
        : whatsappImageUrl;
  const isWebsiteTab = activeTab === "whatsapp";
  const panelCaption = isWebsiteTab
    ? DEMO_SECTION.websiteTabCaption
    : "תצוגה לדוגמה";
  const imageAlt =
    isWebsiteTab ? "דוגמה לאתר עסק שנוצר עם קלינו" : "";

  return (
    <section dir="rtl" className="py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm md:p-8 lg:p-10">
          <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-caleno-ink md:text-3xl">
            {DEMO_SECTION.headline}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium leading-relaxed text-[#64748B] md:text-lg">
            {DEMO_SECTION.subtitle}
          </p>

          <div className="mt-10">
            <div
              className="flex gap-2 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-caleno-off/30 p-1.5 scroll-smooth px-4 shadow-sm md:justify-center md:overflow-visible md:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
                className={`min-h-[44px] min-w-[110px] shrink-0 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium leading-normal md:min-w-0 md:flex-1 md:px-5 ${
                  activeTab === tab.id
                    ? "bg-caleno-deep text-white shadow-sm transition-all duration-200 hover:bg-[#155969] hover:-translate-y-px hover:shadow-md active:translate-y-0"
                    : "text-[#64748B] transition-colors hover:bg-caleno-off hover:text-caleno-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

            <p className="mt-4 text-center text-sm font-normal leading-relaxed text-[#64748B]" dir="rtl">
              {panelCaption}
            </p>
            <div
              id={`demo-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              className="mt-2 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-caleno-off/30 shadow-sm"
            >
              <div className="relative w-full overflow-hidden bg-caleno-off/50 max-h-[360px] md:max-h-none md:h-[650px]">
              {activeImageUrl ? (
                <Image
                  src={activeImageUrl}
                  alt={imageAlt}
                  width={1200}
                  height={800}
                  unoptimized
                  className="w-full h-auto max-h-[360px] object-contain object-center md:max-h-none md:absolute md:inset-0 md:h-full md:w-full"
                />
              ) : (
                <div className="flex min-h-[220px] items-center justify-center md:min-h-0 md:h-full">
                  <span className="text-right text-[#64748B]">
                    {activeLabel} {DEMO_SECTION.placeholderSuffix}
                  </span>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
