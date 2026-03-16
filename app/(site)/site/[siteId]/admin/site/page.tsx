"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import type { SiteConfig } from "@/types/siteConfig";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAuth } from "@/components/auth/AuthProvider";
import AdminTabs from "@/components/ui/AdminTabs";
import {
  AdminReviewsEditor,
  AdminFaqEditor,
} from "@/app/(site)/site/[siteId]/admin/settings/page";
import { VisualSiteEditor, type VisualSiteEditorHandle } from "@/components/editor/VisualSiteEditor";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";

const SITE_PAGE_TABS = [
  { key: "reviews", label: "ביקורות" },
  { key: "faq", label: "FAQ" },
  { key: "design", label: "עיצוב האתר" },
] as const;

type SiteTabKey = (typeof SITE_PAGE_TABS)[number]["key"];

export default function AdminSitePage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const { siteConfig, isSaving, saveMessage, hasUnsavedChanges, handleConfigChange, handleSaveConfig } =
    useSiteConfig(siteId);
  const unsavedCtx = useUnsavedChanges();

  const [activeSiteTab, setActiveSiteTab] = useState<SiteTabKey>("reviews");
  const [designDirty, setDesignDirty] = useState(false);
  const designEditorRef = useRef<VisualSiteEditorHandle>(null);

  const handleSaveAll = useCallback(() => {
    if (activeSiteTab === "design" && designEditorRef.current) {
      const draft = designEditorRef.current.getDraft();
      if (draft) {
        handleConfigChange(draft);
        void handleSaveConfig(draft);
        return;
      }
    }
    void handleSaveConfig();
  }, [activeSiteTab, handleConfigChange, handleSaveConfig]);

  useEffect(() => {
    if (activeSiteTab !== "design") setDesignDirty(false);
  }, [activeSiteTab]);

  const anyUnsaved = hasUnsavedChanges || designDirty;
  useEffect(() => {
    unsavedCtx?.setUnsaved(anyUnsaved, () => handleSaveAll());
  }, [unsavedCtx, anyUnsaved, handleSaveAll]);

  useEffect(() => {
    if (!anyUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyUnsaved]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      if (target.closest("[role=dialog]")) return;
      handleSaveAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSaveAll]);

  if (!siteConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  const sectionCardClass =
    "rounded-3xl border border-[#E2E8F0] bg-white shadow-sm p-6 text-right";
  const sectionTitleClass = "text-lg font-bold text-[#0F172A] mb-4";

  const isDesignTab = activeSiteTab === "design";

  return (
    <div dir="rtl" className={isDesignTab ? "" : "flex flex-col min-h-0 h-full"}>
      {/* When design tab: full-screen panel below admin header (fixed, fills viewport) */}
      {isDesignTab ? (
        <div className="fixed top-20 left-0 right-0 bottom-0 z-10 flex flex-col bg-white border-t border-[#E2E8F0] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {/* Slim bar: tabs + save */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm px-4 py-2">
            <AdminTabs
              tabs={SITE_PAGE_TABS}
              activeKey={activeSiteTab}
              onChange={setActiveSiteTab}
              className="flex-1 min-w-0"
            />
            <div className="flex items-center gap-4 shrink-0">
              {saveMessage && (
                <span className="text-xs text-emerald-600">{saveMessage}</span>
              )}
              <button
                onClick={handleSaveAll}
                disabled={isSaving}
                className="rounded-full bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "שומר…" : "שמור שינויים"}
              </button>
            </div>
          </div>
          {/* Editor fills remaining height */}
          <div className="flex-1 min-h-0 flex flex-col">
            <VisualSiteEditor
              ref={designEditorRef}
              siteId={siteId}
              baselineConfig={siteConfig}
              onSave={(config) => {
                handleConfigChange(config);
                void handleSaveConfig(config);
              }}
              isSaving={isSaving}
              saveMessage={saveMessage ?? undefined}
              hideToolbarSaveAndBack
              onDirtyChange={setDesignDirty}
              getToken={async () => (firebaseUser ? await firebaseUser.getIdToken() : null)}
            />
          </div>
        </div>
      ) : null}

      {/* Hero: only when not on design tab */}
      {!isDesignTab && (
        <div className="shrink-0 mb-4">
          <AdminPageHero
            title="אתר"
            subtitle="לוגו, מיתוג, ביקורות, עיצוב האתר ו־FAQ"
          />
        </div>
      )}

      {/* Other tabs content */}
      {!isDesignTab ? (
        <div className="flex-1 min-w-0 overflow-y-auto">
          <AdminCard className="overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-[#E2E8F0] bg-white/80">
              <AdminTabs
                tabs={SITE_PAGE_TABS}
                activeKey={activeSiteTab}
                onChange={setActiveSiteTab}
                className="flex-1 min-w-0"
              />
              <div className="flex items-center gap-4 shrink-0">
                {saveMessage && (
                  <span className="text-xs text-emerald-600">{saveMessage}</span>
                )}
                <button
                  onClick={handleSaveAll}
                  disabled={isSaving}
                  className="rounded-full bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "שומר…" : "שמור שינויים"}
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="min-h-[320px]">
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
          </AdminCard>
        </div>
      ) : null}
    </div>
  );
}
