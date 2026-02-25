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

  // עיצוב האתר: full-screen visual editor (colors + images)
  if (isDesignTab && siteConfig) {
    return (
      <div dir="rtl" className="h-[calc(100vh-8rem)] min-h-[480px] flex flex-col">
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
    );
  }

  return (
    <div dir="rtl" className="flex flex-col h-full min-h-0">
      {/* Form only — no preview on non-design tabs */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-6">
        <div className="flex items-center justify-between">
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
              className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-caleno-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {isSaving ? "שומר…" : "שמור שינויים"}
            </button>
          </div>
        </div>

        <AdminTabs
          tabs={SITE_PAGE_TABS}
          activeKey={activeSiteTab}
          onChange={setActiveSiteTab}
          className="flex-wrap"
        />

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
    </div>
  );
}
