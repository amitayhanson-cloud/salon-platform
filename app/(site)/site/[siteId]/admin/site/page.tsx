"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { SiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAuth } from "@/components/auth/AuthProvider";
import ConfirmModal from "@/components/ui/ConfirmModal";
import AdminTabs from "@/components/ui/AdminTabs";
import {
  saveBookingSettings,
  convertSalonBookingStateToBookingSettings,
  subscribeBookingSettings,
} from "@/lib/firestoreBookingSettings";
import { resetWorkersAvailabilityToBusinessHours } from "@/lib/resetWorkersAvailability";
import {
  BrandingLogoEditor,
  AdminReviewsEditor,
  AdminFaqEditor,
  AdminBookingTab,
} from "@/app/(site)/site/[siteId]/admin/settings/page";
import { VisualSiteEditor } from "@/components/editor/VisualSiteEditor";

function validateBreaks(s: SalonBookingState): string | null {
  for (let i = 0; i < s.openingHours.length; i++) {
    const day = s.openingHours[i];
    if (!day?.open || !day?.close) continue;
    const breaks = day.breaks ?? [];
    const openMin = day.open
      .split(":")
      .reduce((a, b, idx) => a + (idx === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
    const closeMin = day.close
      .split(":")
      .reduce((a, b, idx) => a + (idx === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
    for (let bi = 0; bi < breaks.length; bi++) {
      const b = breaks[bi]!;
      const [sH, sM] = b.start.split(":").map(Number);
      const [eH, eM] = b.end.split(":").map(Number);
      const sMin = (sH ?? 0) * 60 + (sM ?? 0);
      const eMin = (eH ?? 0) * 60 + (eM ?? 0);
      if (sMin >= eMin)
        return `${day.label}: הפסקה ${bi + 1} – שעת התחלה חייבת להיות לפני שעת סיום`;
      if (sMin < openMin || eMin > closeMin)
        return `${day.label}: הפסקה ${bi + 1} – חייבת להיות בתוך שעות הפתיחה`;
      for (let j = bi + 1; j < breaks.length; j++) {
        const o = breaks[j]!;
        const oS =
          (parseInt(o.start.split(":")[0], 10) || 0) * 60 +
          (parseInt(o.start.split(":")[1], 10) || 0);
        const oE =
          (parseInt(o.end.split(":")[0], 10) || 0) * 60 +
          (parseInt(o.end.split(":")[1], 10) || 0);
        if (sMin < oE && eMin > oS) return `${day.label}: הפסקות לא יכולות לחפוף`;
      }
    }
  }
  return null;
}

const SITE_PAGE_TABS = [
  { key: "branding", label: "לוגו ומיתוג" },
  { key: "reviews", label: "ביקורות" },
  { key: "hours", label: "שעות פעילות" },
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

  const [bookingState, setBookingState] = useState<SalonBookingState | null>(null);
  const [showHoursConfirmModal, setShowHoursConfirmModal] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [bookingHoursToast, setBookingHoursToast] = useState<string | null>(null);
  const [bookingSaveError, setBookingSaveError] = useState<string | null>(null);
  const [activeSiteTab, setActiveSiteTab] = useState<SiteTabKey>("branding");

  useEffect(() => {
    if (!bookingHoursToast) return;
    const t = setTimeout(() => setBookingHoursToast(null), 5000);
    return () => clearTimeout(t);
  }, [bookingHoursToast]);

  useEffect(() => {
    if (typeof window === "undefined" || !siteId) return;
    const dayLabels = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const unsubscribe = subscribeBookingSettings(
      siteId,
      (firestoreSettings) => {
        const openingHours = (["0", "1", "2", "3", "4", "5", "6"] as const).map((key, i) => {
          const d = firestoreSettings.days[key];
          const enabled = d?.enabled ?? false;
          const breaks = (d as { breaks?: { start: string; end: string }[] })?.breaks;
          return {
            day: dayKeys[i],
            label: dayLabels[i],
            open: enabled ? (d?.start ?? null) : null,
            close: enabled ? (d?.end ?? null) : null,
            breaks: breaks && breaks.length > 0 ? breaks : undefined,
          };
        });
        const closedDates = (
          firestoreSettings as { closedDates?: Array<{ date: string; label?: string }> }
        ).closedDates;
        const convertedState: SalonBookingState = {
          defaultSlotMinutes: firestoreSettings.slotMinutes,
          openingHours,
          workers: [],
          bookings: [],
          closedDates: Array.isArray(closedDates) && closedDates.length > 0 ? closedDates : [],
        };
        setBookingState(convertedState);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(convertedState));
        }
      },
      (err) => {
        console.error("[Admin] Failed to load booking settings", err);
        try {
          const bookingRaw = window.localStorage.getItem(`bookingState:${siteId}`);
          if (bookingRaw) setBookingState(JSON.parse(bookingRaw));
          else setBookingState(defaultBookingState);
        } catch {
          setBookingState(defaultBookingState);
        }
      }
    );
    return () => unsubscribe();
  }, [siteId]);

  const handleBookingStateChange = (next: SalonBookingState) => {
    setBookingState(next);
    const err = validateBreaks(next);
    setBookingSaveError(err ?? null);
    if (typeof window !== "undefined" && siteId) {
      window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(next));
    }
  };

  const handleSaveHoursClick = () => {
    if (!bookingState) return;
    const err = validateBreaks(bookingState);
    if (err) {
      setBookingSaveError(err);
      return;
    }
    setBookingSaveError(null);
    setShowHoursConfirmModal(true);
  };

  const handleConfirmSaveHours = async () => {
    if (!bookingState || !siteId) return;
    setHoursSaving(true);
    try {
      const bookingSettings = convertSalonBookingStateToBookingSettings(bookingState);
      await saveBookingSettings(siteId, bookingSettings);
      await resetWorkersAvailabilityToBusinessHours(siteId, bookingSettings);
      setBookingHoursToast("שעות הפעילות נשמרו. זמינות העובדים אופסה בהתאם.");
      setShowHoursConfirmModal(false);
    } catch (error) {
      console.error("[Admin] Failed to save booking settings:", error);
    } finally {
      setHoursSaving(false);
    }
  };

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
              לוגו, מיתוג, ביקורות, שעות פעילות, עיצוב האתר ו־FAQ
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

        {/* שעות פעילות */}
        <div
          role="tabpanel"
          aria-hidden={activeSiteTab !== "hours"}
          className={activeSiteTab === "hours" ? "block" : "hidden"}
        >
          <section className={sectionCardClass}>
            <h2 className={sectionTitleClass}>שעות פעילות</h2>
            {bookingHoursToast && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 text-right">
                {bookingHoursToast}
              </div>
            )}
            {bookingSaveError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 text-right">
                {bookingSaveError}
              </div>
            )}
            {bookingState && (
              <AdminBookingTab
                state={bookingState}
                onChange={handleBookingStateChange}
                onSaveRequest={handleSaveHoursClick}
              />
            )}
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

      <ConfirmModal
        open={showHoursConfirmModal}
        onConfirm={handleConfirmSaveHours}
        onClose={() => setShowHoursConfirmModal(false)}
        message="שמירת שעות הפעילות תאפס את זמינות כל העובדים ותתאים אותה לשעות הפעילות של העסק. האם להמשיך?"
        messageSecondary="Saving business hours will reset all workers' availability to match the business hours. Do you want to continue?"
        confirmLabel="אישור"
        cancelLabel="ביטול"
        submitting={hoursSaving}
      />
    </div>
  );
}
