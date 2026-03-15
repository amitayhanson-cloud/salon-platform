"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { SiteConfig } from "@/types/siteConfig";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAuth } from "@/components/auth/AuthProvider";
import AdminTabs from "@/components/ui/AdminTabs";
import {
  BrandingLogoEditor,
  AdminReviewsEditor,
  AdminFaqEditor,
} from "@/app/(site)/site/[siteId]/admin/settings/page";
import { VisualSiteEditor } from "@/components/editor/VisualSiteEditor";

const SITE_PAGE_TABS = [
  { key: "branding", label: "לוגו ומיתוג" },
  { key: "reviews", label: "ביקורות" },
  { key: "design", label: "עיצוב האתר" },
  { key: "faq", label: "FAQ" },
] as const;

type SiteTabKey = (typeof SITE_PAGE_TABS)[number]["key"];

export default function AdminSitePage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const { siteConfig, isSaving, saveMessage, handleConfigChange, handleSaveConfig } =
    useSiteConfig(siteId);

  const [activeSiteTab, setActiveSiteTab] = useState<SiteTabKey>("branding");

  if (!siteConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  const sectionCardClass =
    "bg-white rounded-2xl border border-slate-200 p-6 text-right";
  const sectionTitleClass = "text-lg font-bold text-slate-900 mb-4";

  const isDesignTab = activeSiteTab === "design";

  return (
    <div
      dir="rtl"
      className={`flex flex-col min-h-0 ${isDesignTab ? "h-[calc(100vh-8rem)] min-h-[520px]" : "h-full"}`}
    >
      {/* Header row: title + save — always visible under navbar */}
      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">אתר</h1>
          <p className="text-sm text-slate-500 mt-1">
            לוגו, מיתוג, ביקורות, עיצוב האתר ו־FAQ
          </p>
        </div>
        <div className="flex items-center gap-4">
          {saveMessage && (
            <span className="text-xs text-emerald-600">{saveMessage}</span>
          )}
          <button
            onClick={() => void handleSaveConfig()}
            disabled={isSaving}
            className="rounded-lg bg-caleno-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "שומר…" : "שמור שינויים"}
          </button>
        </div>
      </div>

      {/* Site tabs: always visible under header so user can switch without going back */}
      <div className="shrink-0 mb-4">
        <AdminTabs
          tabs={SITE_PAGE_TABS}
          activeKey={activeSiteTab}
          onChange={setActiveSiteTab}
          className="flex-wrap"
        />
      </div>

      {/* Content: editor when design tab, form panels otherwise */}
      {isDesignTab ? (
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-white">
          <VisualSiteEditor
            siteId={siteId}
            baselineConfig={siteConfig}
            onSave={(config) => {
              handleConfigChange(config);
              void handleSaveConfig(config);
            }}
            onBack={() => setActiveSiteTab("branding")}
            isSaving={isSaving}
            saveMessage={saveMessage ?? undefined}
          />
        </div>
      ) : (
        <div className="flex-1 min-w-0 overflow-y-auto space-y-6">
          {/* Tab panels: all mounted so Firestore listeners and state stay alive; only one visible */}
          <div className="min-h-[320px]">
        {/* לוגו ומיתוג */}
        <div
          role="tabpanel"
          aria-hidden={activeSiteTab !== "branding"}
          className={activeSiteTab === "branding" ? "block" : "hidden"}
        >
          <section className={sectionCardClass}>
            <h2 className={sectionTitleClass}>לוגו ומיתוג</h2>
            <BrandingLogoEditor
              siteId={siteId}
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              onSave={handleSaveConfig}
              isSaving={isSaving}
              getToken={async () => (firebaseUser ? await firebaseUser.getIdToken() : null)}
            />
          </section>
        </div>

        {/* ביקורות */}
        <div
          role="tabpanel"
          aria-hidden={activeSiteTab !== "reviews"}
          className={activeSiteTab === "reviews" ? "block" : "hidden"}
        >
          <section className={sectionCardClass}>
            <h2 className={sectionTitleClass}>ביקורות</h2>
            <AdminReviewsEditor
              siteId={siteId}
              reviews={siteConfig.reviews || []}
              onChange={(reviews) => handleConfigChange({ reviews })}
            />
          </section>
        </div>

        {/* FAQ */}
        <div
          role="tabpanel"
          aria-hidden={activeSiteTab !== "faq"}
          className={activeSiteTab === "faq" ? "block" : "hidden"}
        >
          <section className={sectionCardClass}>
            <h2 className={sectionTitleClass}>FAQ</h2>
            <AdminFaqEditor
              faqs={siteConfig.faqs || []}
              onChange={(faqs) => handleConfigChange({ faqs })}
            />
          </section>
        </div>
          </div>
        </div>
      )}
    </div>
  );
}
