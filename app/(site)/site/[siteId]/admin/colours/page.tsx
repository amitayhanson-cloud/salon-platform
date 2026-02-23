"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultThemeColors } from "@/types/siteConfig";
import { useSiteConfig } from "@/hooks/useSiteConfig";

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
  const currentTheme = siteConfig.themeColors || defaultThemeColors;
  const [themeColors, setThemeColors] = useState(currentTheme);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync with siteConfig changes
  useEffect(() => {
    setThemeColors(siteConfig.themeColors || defaultThemeColors);
  }, [siteConfig.themeColors]);

  // Validate hex color format
  const isValidHex = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  const updateColor = (key: keyof typeof themeColors, value: string) => {
    const newColors = { ...themeColors, [key]: value };
    setThemeColors(newColors);
    
    // Validate
    if (!isValidHex(value)) {
      setErrors((prev) => ({ ...prev, [key]: "צבע לא תקין. השתמש בפורמט #RRGGBB" }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    
    // Update config immediately
    onChange({ themeColors: newColors });
  };

  const restoreDefaults = () => {
    setThemeColors(defaultThemeColors);
    setErrors({});
    onChange({ themeColors: defaultThemeColors });
  };

  const hasErrors = Object.keys(errors).length > 0;

  const colorFields: Array<{
    key: keyof typeof themeColors;
    label: string;
    description: string;
  }> = [
    { key: "background", label: "רקע כללי", description: "רקע העמוד הראשי" },
    { key: "surface", label: "רקע כרטיסים", description: "רקע של כרטיסים ותיבות" },
    { key: "text", label: "טקסט ראשי", description: "צבע הטקסט העיקרי" },
    { key: "mutedText", label: "טקסט משני", description: "צבע טקסט משני/מובלע" },
    { key: "primary", label: "צבע ראשי", description: "כפתורים והדגשות" },
    { key: "primaryText", label: "טקסט על ראשי", description: "טקסט על רקע ראשי" },
    { key: "accent", label: "צבע דגש", description: "דגשים קטנים, גבולות" },
    { key: "border", label: "צבע גבול", description: "גבולות של תיבות" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">צבעי האתר</h2>
          <p className="text-xs text-slate-500 mt-1">
            התאם את צבעי האתר לפי העדפותיך. השינויים יופיעו מיד לאחר השמירה.
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
            className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-caleno-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {colorFields.map((field) => {
          const value = themeColors[field.key];
          const hasError = !!errors[field.key];
          return (
            <div key={field.key} className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {field.label}
              </label>
              <p className="text-xs text-slate-500">{field.description}</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={value}
                  onChange={(e) => updateColor(field.key, e.target.value)}
                  className="w-16 h-10 rounded-lg border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateColor(field.key, e.target.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-right text-sm font-mono focus:outline-none focus:ring-2 ${
                    hasError
                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                      : "border-slate-300 focus:ring-caleno-500 focus:border-caleno-500"
                  }`}
                  placeholder="#RRGGBB"
                />
              </div>
              {hasError && (
                <p className="text-xs text-red-600">{errors[field.key]}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview section */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">תצוגה מקדימה</h3>
        <div
          className="rounded-2xl p-6 border-2"
          style={{
            backgroundColor: themeColors.background,
            borderColor: themeColors.border,
          }}
        >
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              borderWidth: "1px",
            }}
          >
            <h4
              className="text-lg font-semibold mb-2"
              style={{ color: themeColors.text }}
            >
              כותרת דוגמה
            </h4>
            <p
              className="text-sm mb-3"
              style={{ color: themeColors.mutedText }}
            >
              זהו טקסט משני לדוגמה
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-medium"
              style={{
                backgroundColor: themeColors.primary,
                color: themeColors.primaryText,
              }}
            >
              כפתור דוגמה
            </button>
          </div>
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: themeColors.accent,
              color: themeColors.primaryText,
            }}
          >
            תג דגש
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">צבעים</h1>
          <p className="text-sm text-slate-500 mt-1">
            התאם את צבעי האתר לפי העדפותיך
          </p>
        </div>
        {saveMessage && (
          <span className="text-xs text-emerald-600">{saveMessage}</span>
        )}
      </div>

      <AdminColorsTab
        siteConfig={siteConfig}
        onChange={handleConfigChange}
        onSave={handleSaveConfig}
        isSaving={isSaving}
      />
    </div>
  );
}
