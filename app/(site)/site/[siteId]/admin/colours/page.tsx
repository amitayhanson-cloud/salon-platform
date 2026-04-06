"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { SiteConfig, ThemePalette } from "@/types/siteConfig";
import { defaultThemePalette } from "@/types/siteConfig";
import { resolveThemePalette, resolveVisualTheme } from "@/lib/themePalette";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";

const SERVICE_OPTIONS: Record<SiteConfig["salonType"], string[]> = {
  hair: ["תספורת", "צבע", "פן", "החלקה", "טיפולי שיער"],
  nails: ["מניקור", "פדיקור", "לק ג׳ל", "בניית ציפורניים", "טיפול כף רגל"],
  barber: ["תספורת גברים", "עיצוב זקן", "תספורת ילדים"],
  spa: ["עיסוי", "טיפולי פנים", "טיפול גוף", "שיאצו", "רפלקסולוגיה"],
  mixed: [
    "תספורת",
    "צבע",
    "פן",
    "לק ג׳ל",
    "מניקור",
    "פדיקור",
    "עיסוי",
    "טיפולי פנים",
  ],
  other: [],
};


// vibeLabels kept for backwards compatibility but no longer used in UI
const vibeLabels: Record<NonNullable<SiteConfig["vibe"]>, string> = {
  luxury: "סגנון יוקרתי",
  clean: "סגנון נקי ורך",
  colorful: "סגנון צבעוני וכיפי",
  spa: "לא בשימוש כרגע",
  surprise: "לא בשימוש כרגע",
};

// photosOptionLabels kept for backwards compatibility but no longer used in UI
const photosOptionLabels: Record<NonNullable<SiteConfig["photosOption"]>, string> = {
  own: "אני מעלה תמונות שלי",
  ai: "AI ייצור תמונות בשבילי",
  mixed: "שילוב של שניהם",
};

const extraPageLabels: Record<SiteConfig["extraPages"][number], string> = {
  reviews: "ביקורות מלקוחות",
  faq: "שאלות נפוצות",
};

const salonTypeLabels: Record<SiteConfig["salonType"], string> = {
  hair: "ספרות / עיצוב שיער",
  nails: "מניקור / פדיקור",
  barber: "ברברשופ",
  spa: "ספא / טיפולי גוף",
  mixed: "משולב",
  other: "אחר",
};



const PALETTE_GROUPS: { title: string; keys: (keyof ThemePalette)[] }[] = [
  { title: "מותג ודגשים", keys: ["primary", "secondary"] },
  { title: "רקעים", keys: ["background", "headerFooter"] },
  { title: "פעולות ואייקונים", keys: ["cta", "icons"] },
];

const PALETTE_LABELS: Record<keyof ThemePalette, { label: string; description: string }> = {
  primary: { label: "דגש ראשי / מותג", description: "כותרות משנה, מסגרות דגושות" },
  secondary: { label: "משני ומסגרות", description: "גבולות ורקעים עדינים" },
  background: { label: "רקע העמוד", description: "הרקע הכללי של האתר" },
  headerFooter: { label: "כותרת ופוטר", description: "פס עליון ותחתון" },
  cta: { label: "כפתורי פעולה", description: "למשל קביעת תור" },
  icons: { label: "אייקונים", description: "אייקונים בגלישה" },
};

export function AdminColorsTab({
  siteConfig,
  onChange,
  onSave,
  isSaving,
}: {
  siteConfig: SiteConfig;
  onChange: (updates: Partial<SiteConfig>) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [palette, setPalette] = useState<ThemePalette>(() => resolveThemePalette(siteConfig));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setPalette(resolveThemePalette(siteConfig));
  }, [siteConfig]);

  const isValidHex = (color: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(color);

  const updateColor = (key: keyof ThemePalette, value: string) => {
    const next = { ...palette, [key]: value };
    setPalette(next);
    if (!isValidHex(value)) {
      setErrors((prev) => ({ ...prev, [key]: "צבע לא תקין. השתמש בפורמט #RRGGBB" }));
    } else {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    }
    onChange({ themePalette: next });
  };

  const restoreDefaults = () => {
    setPalette(defaultThemePalette);
    setErrors({});
    onChange({ themePalette: defaultThemePalette });
  };

  const hasErrors = Object.keys(errors).length > 0;
  const preview = resolveVisualTheme({ ...siteConfig, themePalette: palette });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">ערכת צבעים</h2>
          <p className="text-xs text-slate-500 mt-1">
            צבעים מרכזיים לאתר. לעריכת תוכן ותמונות השתמשו ב&quot;עיצוב האתר&quot; (עורך חזותי).
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={restoreDefaults}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            שחזר ברירת מחדל
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || hasErrors}
            className="rounded-lg bg-caleno-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "שומר…" : "שמור שינויים"}
          </button>
        </div>
      </div>

      {hasErrors && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
          <p className="text-xs text-red-700 font-medium mb-1">יש שגיאות בצבעים:</p>
          <ul className="text-xs text-red-600 space-y-1">
            {Object.entries(errors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-8">
        {PALETTE_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{g.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {g.keys.map((key) => {
                const value = palette[key];
                const meta = PALETTE_LABELS[key];
                const hasError = !!errors[key];
                return (
                  <div key={key} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">{meta.label}</label>
                    <p className="text-xs text-slate-500">{meta.description}</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-right text-sm font-mono focus:outline-none focus:ring-2 ${
                          hasError
                            ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                            : "border-slate-300 focus:ring-caleno-deep focus:border-caleno-deep"
                        }`}
                        placeholder="#RRGGBB"
                      />
                    </div>
                    {hasError && <p className="text-xs text-red-600">{errors[key]}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">תצוגה מקדימה</h3>
        <div
          className="rounded-2xl p-6 border-2"
          style={{
            backgroundColor: preview.background,
            borderColor: preview.secondary,
          }}
        >
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              backgroundColor: preview.surface,
              borderColor: preview.secondary,
              borderWidth: "1px",
            }}
          >
            <h4 className="text-lg font-semibold mb-2" style={{ color: preview.foreground }}>
              כותרת דוגמה
            </h4>
            <p className="text-sm mb-3" style={{ color: preview.mutedForeground }}>
              זהו טקסט משני לדוגמה
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-medium"
              style={{
                backgroundColor: preview.cta,
                color: preview.ctaText,
              }}
            >
              קביעת תור
            </button>
          </div>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
            style={{
              backgroundColor: preview.headerFooter,
              color: preview.foreground,
              borderWidth: 1,
              borderColor: preview.secondary,
            }}
          >
            <span style={{ color: preview.icons }} aria-hidden>
              ●
            </span>
            פס כותרת / פוטר
          </div>
        </div>
      </div>
    </div>
  );
}


export default function ColoursPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { siteConfig, isSaving, saveMessage, handleConfigChange, handleSaveConfig } = useSiteConfig(siteId);

  if (!siteConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <AdminPageHero
          title="צבעים"
          subtitle="התאם את צבעי האתר לפי העדפותיך"
          className="flex-1"
        />
        {saveMessage && (
          <span className="text-xs text-emerald-600 shrink-0">{saveMessage}</span>
        )}
      </div>

      <AdminCard className="p-6">
      <AdminColorsTab
        siteConfig={siteConfig}
        onChange={handleConfigChange}
        onSave={handleSaveConfig}
        isSaving={isSaving}
      />
      </AdminCard>
    </div>
  );
}
