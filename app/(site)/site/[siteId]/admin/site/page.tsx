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
  const [showRotateHintModal, setShowRotateHintModal] = useState(false);
  const [leaveDesignModalOpen, setLeaveDesignModalOpen] = useState(false);
  const [pendingSiteTab, setPendingSiteTab] = useState<SiteTabKey | null>(null);
  const [tabSwitchSaving, setTabSwitchSaving] = useState(false);
  const designEditorRef = useRef<VisualSiteEditorHandle>(null);

  const applySiteTab = useCallback((key: SiteTabKey) => {
    setActiveSiteTab(key);
    if (key === "design" && typeof window !== "undefined" && window.innerWidth < 768) {
      setShowRotateHintModal(true);
    }
  }, []);

  const handleSiteTabChange = useCallback(
    (key: SiteTabKey) => {
      if (activeSiteTab === "design" && designDirty && key !== "design") {
        setPendingSiteTab(key);
        setLeaveDesignModalOpen(true);
        return;
      }
      applySiteTab(key);
    },
    [activeSiteTab, designDirty, applySiteTab]
  );

  const handleSaveAll = useCallback(async () => {
    if (activeSiteTab === "design" && designEditorRef.current) {
      const draft = designEditorRef.current.getDraft();
      if (draft) {
        const merged = {
          ...draft,
          reviews: siteConfig?.reviews ?? draft.reviews ?? [],
          faqs: siteConfig?.faqs ?? draft.faqs ?? [],
        };
        handleConfigChange(merged);
        await handleSaveConfig(merged);
        return;
      }
    }
    await handleSaveConfig();
  }, [activeSiteTab, handleConfigChange, handleSaveConfig, siteConfig]);

  useEffect(() => {
    if (activeSiteTab !== "design") setDesignDirty(false);
  }, [activeSiteTab]);

  const anyUnsaved = hasUnsavedChanges || designDirty;
  useEffect(() => {
    unsavedCtx?.setUnsaved(anyUnsaved, () => {
      void handleSaveAll();
    });
    return () => {
      unsavedCtx?.setUnsaved(false, () => {});
    };
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
      void handleSaveAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSaveAll]);

  const handleLeaveDesignSaveAndSwitch = useCallback(async () => {
    if (!pendingSiteTab) return;
    setTabSwitchSaving(true);
    try {
      await handleSaveAll();
      applySiteTab(pendingSiteTab);
      setLeaveDesignModalOpen(false);
      setPendingSiteTab(null);
    } finally {
      setTabSwitchSaving(false);
    }
  }, [pendingSiteTab, handleSaveAll, applySiteTab]);

  const handleLeaveDesignWithoutSave = useCallback(() => {
    if (pendingSiteTab) applySiteTab(pendingSiteTab);
    setLeaveDesignModalOpen(false);
    setPendingSiteTab(null);
  }, [pendingSiteTab, applySiteTab]);

  const handleLeaveDesignCancel = useCallback(() => {
    setLeaveDesignModalOpen(false);
    setPendingSiteTab(null);
  }, []);

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
        <div className="fixed top-20 left-0 right-0 bottom-0 z-0 flex flex-col bg-white border-t border-[#E2E8F0] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {/* Slim bar: tabs + save */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm px-4 py-2">
            <AdminTabs
              tabs={SITE_PAGE_TABS}
              activeKey={activeSiteTab}
              onChange={handleSiteTabChange}
              className="flex-1 min-w-0"
            />
            <div className="flex items-center gap-4 shrink-0">
              {saveMessage && (
                <span className="text-xs text-emerald-600">{saveMessage}</span>
              )}
              {designDirty && (
                <button
                  type="button"
                  onClick={() => void handleSaveAll()}
                  disabled={isSaving}
                  className="rounded-full bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "שומר…" : "שמור שינויים"}
                </button>
              )}
            </div>
          </div>

          {/* Mobile: rotate to landscape hint modal */}
          {showRotateHintModal && (
            <>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    @keyframes rotateHintPhone {
                      0% { transform: rotate(0deg); }
                      25% { transform: rotate(90deg); }
                      50% { transform: rotate(90deg); }
                      75% { transform: rotate(0deg); }
                      100% { transform: rotate(0deg); }
                    }
                  `,
                }}
              />
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rotate-hint-title"
                aria-describedby="rotate-hint-desc"
                onClick={() => setShowRotateHintModal(false)}
                dir="rtl"
              >
                <div
                  className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 max-w-sm w-full text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-center mb-4">
                    <div
                      className="w-14 h-28 rounded-[20px] border-4 border-slate-300 bg-slate-100 flex items-center justify-center shadow-inner"
                      style={{ animation: "rotateHintPhone 2.5s ease-in-out infinite" }}
                    >
                      <div className="w-8 h-14 rounded-md bg-slate-200/80" />
                    </div>
                  </div>
                  <h2 id="rotate-hint-title" className="text-lg font-bold text-slate-900 mb-2">
                    לעריכה נוחה יותר
                  </h2>
                  <p id="rotate-hint-desc" className="text-sm text-slate-600 mb-6">
                    עריכת האתר במצב אנכי עלולה להיות לא נוחה. מומלץ להפך את המכשיר למצב אופקי.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRotateHintModal(false)}
                    className="w-full rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1E293B] transition-colors"
                  >
                    הבנתי
                  </button>
                </div>
              </div>
            </>
          )}

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

          {leaveDesignModalOpen && (
            <div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
              dir="rtl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-design-title"
            >
              <div
                className="w-full max-w-md rounded-3xl border border-[#E2E8F0] bg-white p-6 text-right shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="leave-design-title" className="mb-2 text-lg font-semibold text-slate-900">
                  שינויים שלא נשמרו
                </h2>
                <p className="mb-6 text-sm text-slate-600">
                  יש שינויים בעיצוב האתר שלא נשמרו. לעבור לטאב אחר בלי לשמור?
                </p>
                <div className="flex flex-wrap justify-start gap-3">
                  <button
                    type="button"
                    onClick={() => void handleLeaveDesignSaveAndSwitch()}
                    disabled={tabSwitchSaving || isSaving}
                    className="rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tabSwitchSaving ? "שומר…" : "שמור ועבור"}
                  </button>
                  <button
                    type="button"
                    onClick={handleLeaveDesignWithoutSave}
                    disabled={tabSwitchSaving}
                    className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    מעבר בלי לשמור
                  </button>
                  <button
                    type="button"
                    onClick={handleLeaveDesignCancel}
                    disabled={tabSwitchSaving}
                    className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}
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
                onChange={handleSiteTabChange}
                className="flex-1 min-w-0"
              />
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
