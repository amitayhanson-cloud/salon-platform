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
  AdminSiteTab,
} from "@/app/(site)/site/[siteId]/admin/settings/page";
import {
  AdminOpeningHoursSection,
  type AdminOpeningHoursSectionHandle,
} from "@/components/admin/AdminOpeningHoursSection";
import { VisualSiteEditor, type VisualSiteEditorHandle } from "@/components/editor/VisualSiteEditor";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";
import { useMobileImmersiveSiteEditor } from "@/components/admin/MobileImmersiveSiteEditorContext";
import { AdminPublicTemplatePicker } from "@/components/admin/AdminPublicTemplatePicker";

const SITE_PAGE_TABS_DESKTOP = [
  { key: "basic", label: "מידע בסיסי" },
  { key: "template", label: "תבנית אתר" },
  { key: "contact", label: "פרטי יצירת קשר" },
  { key: "reviews", label: "ביקורות" },
  { key: "faq", label: "FAQ" },
  { key: "hours", label: "שעות פעילות" },
  { key: "design", label: "עיצוב האתר" },
] as const;

const SITE_PAGE_TABS_MOBILE = [
  { key: "basic", label: "מידע בסיסי" },
  { key: "template", label: "תבנית אתר" },
  { key: "contact", label: "פרטי יצירת קשר" },
  { key: "reviews", label: "ביקורות" },
  { key: "faq", label: "FAQ" },
  { key: "hours", label: "שעות פעילות" },
  { key: "design", label: "עיצוב האתר" },
] as const;

type SiteTabKey =
  | (typeof SITE_PAGE_TABS_DESKTOP)[number]["key"]
  | (typeof SITE_PAGE_TABS_MOBILE)[number]["key"];

export default function AdminSitePage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const { siteConfig, isSaving, saveMessage, hasUnsavedChanges, handleConfigChange, handleSaveConfig } =
    useSiteConfig(siteId);
  const unsavedCtx = useUnsavedChanges();
  const { setImmersiveMobileSiteEditor } = useMobileImmersiveSiteEditor();

  const [isMobileTabs, setIsMobileTabs] = useState(false);
  const [activeSiteTab, setActiveSiteTab] = useState<SiteTabKey>("basic");
  const [designDirty, setDesignDirty] = useState(false);
  const [leaveDesignModalOpen, setLeaveDesignModalOpen] = useState(false);
  const [pendingSiteTab, setPendingSiteTab] = useState<SiteTabKey | null>(null);
  const [tabSwitchSaving, setTabSwitchSaving] = useState(false);
  const [hoursUnsaved, setHoursUnsaved] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileTabs(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const sitePageTabs = isMobileTabs ? SITE_PAGE_TABS_MOBILE : SITE_PAGE_TABS_DESKTOP;

  const designEditorRef = useRef<VisualSiteEditorHandle>(null);
  const openingHoursRef = useRef<AdminOpeningHoursSectionHandle>(null);

  const applySiteTab = useCallback((key: SiteTabKey) => {
    setActiveSiteTab(key);
  }, []);

  const handleRequestExitEditor = useCallback(() => {
    if (designDirty) {
      setPendingSiteTab("basic");
      setLeaveDesignModalOpen(true);
    } else {
      applySiteTab("basic");
    }
  }, [designDirty, applySiteTab]);

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
        // Ref can be null after await (tab switch, unmount, Strict Mode) — still clear dirty state
        if (designEditorRef.current) {
          designEditorRef.current.markSaved();
        } else {
          setDesignDirty(false);
        }
        return;
      }
    }
    await handleSaveConfig();
    await openingHoursRef.current?.saveIfDirtyWithoutModal();
  }, [activeSiteTab, handleConfigChange, handleSaveConfig, siteConfig]);

  useEffect(() => {
    if (activeSiteTab !== "design") setDesignDirty(false);
  }, [activeSiteTab]);

  useEffect(() => {
    const immersive = activeSiteTab === "design" && isMobileTabs;
    setImmersiveMobileSiteEditor(immersive);
    return () => setImmersiveMobileSiteEditor(false);
  }, [activeSiteTab, isMobileTabs, setImmersiveMobileSiteEditor]);

  const anyUnsaved = hasUnsavedChanges || designDirty || hoursUnsaved;
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
        <div className="fixed inset-0 z-0 flex flex-col bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:top-20 md:border-t md:border-[#E2E8F0]">
          {/* Slim bar: tabs + save (desktop only — mobile uses immersive editor) */}
          <div className="hidden shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white/95 px-4 py-2 backdrop-blur-sm md:flex">
            <AdminTabs
              tabs={sitePageTabs}
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

          {/* Editor fills remaining height */}
          <div className="flex-1 min-h-0 flex flex-col">
            <VisualSiteEditor
              ref={designEditorRef}
              siteId={siteId}
              baselineConfig={siteConfig}
              onSave={async (config) => {
                handleConfigChange(config);
                await handleSaveConfig(config);
              }}
              isSaving={isSaving}
              saveMessage={saveMessage ?? undefined}
              hideToolbarSaveAndBack
              onDirtyChange={setDesignDirty}
              onRequestExit={handleRequestExitEditor}
              getToken={async () => (firebaseUser ? await firebaseUser.getIdToken() : null)}
            />
          </div>

          {leaveDesignModalOpen && (
            <div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
              data-admin-modal-overlay=""
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
            subtitle="תבנית דף הנחיתה, לוגו, מיתוג, ביקורות, FAQ, שעות פעילות ועיצוב האתר"
          />
        </div>
      )}

      {/* Other tabs content */}
      {!isDesignTab ? (
        <div className="flex-1 min-w-0 overflow-y-auto">
          <AdminCard className="overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white/80 px-4 py-3 sm:gap-4 sm:px-6">
              <AdminTabs
                tabs={sitePageTabs}
                activeKey={activeSiteTab}
                onChange={handleSiteTabChange}
                className="min-w-0 flex-1"
              />
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-3 sm:w-auto">
                {saveMessage ? (
                  <span className="text-xs text-emerald-600">{saveMessage}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSaveAll()}
                  disabled={isSaving || (!hasUnsavedChanges && !hoursUnsaved)}
                  className="min-h-[44px] rounded-full bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "שומר…" : "שמור שינויים"}
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="min-h-[320px]">
                {/* מידע בסיסי */}
                <div
                  role="tabpanel"
                  aria-hidden={activeSiteTab !== "basic"}
                  className={activeSiteTab === "basic" ? "block" : "hidden"}
                >
                  <section className={sectionCardClass}>
                    <h2 className={sectionTitleClass}>מידע בסיסי</h2>
                    <AdminSiteTab
                      siteConfig={siteConfig}
                      onChange={handleConfigChange}
                      renderSections={["basic", "location", "specialNote"]}
                    />
                  </section>
                </div>

                {/* תבנית אתר */}
                <div
                  role="tabpanel"
                  aria-hidden={activeSiteTab !== "template"}
                  className={activeSiteTab === "template" ? "block" : "hidden"}
                >
                  <section className={sectionCardClass}>
                    <h2 className={sectionTitleClass}>תבנית אתר</h2>
                    <AdminPublicTemplatePicker
                      siteConfig={siteConfig}
                      onApplyTemplate={(patch) => handleConfigChange(patch)}
                    />
                  </section>
                </div>

                {/* פרטי יצירת קשר */}
                <div
                  role="tabpanel"
                  aria-hidden={activeSiteTab !== "contact"}
                  className={activeSiteTab === "contact" ? "block" : "hidden"}
                >
                  <section className={sectionCardClass}>
                    <h2 className={sectionTitleClass}>פרטי יצירת קשר</h2>
                    <AdminSiteTab
                      siteConfig={siteConfig}
                      onChange={handleConfigChange}
                      renderSections={["contact"]}
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

                {/* שעות פעילות */}
                <div
                  role="tabpanel"
                  aria-hidden={activeSiteTab !== "hours"}
                  className={activeSiteTab === "hours" ? "block" : "hidden"}
                >
                  <section className={sectionCardClass}>
                    <AdminOpeningHoursSection
                      ref={openingHoursRef}
                      siteId={siteId}
                      onUnsavedChange={setHoursUnsaved}
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
