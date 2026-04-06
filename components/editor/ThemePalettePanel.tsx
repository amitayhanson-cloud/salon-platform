"use client";

import type { SiteConfig, ThemePalette } from "@/types/siteConfig";
import { resolveThemePalette } from "@/lib/themePalette";

const GROUPS: { title: string; keys: (keyof ThemePalette)[] }[] = [
  {
    title: "מותג ודגשים",
    keys: ["primary", "secondary"],
  },
  {
    title: "רקעים",
    keys: ["background", "headerFooter"],
  },
  {
    title: "פעולות ואייקונים",
    keys: ["cta", "icons"],
  },
];

const LABELS: Record<keyof ThemePalette, string> = {
  primary: "צבע מותג (דגש ראשי)",
  secondary: "משני ומסגרות",
  background: "רקע העמוד",
  headerFooter: "כותרת עליונה ופוטר",
  cta: "כפתורי פעולה (קביעת תור)",
  icons: "אייקונים",
};

type ThemePalettePanelProps = {
  draftConfig: SiteConfig;
  onPaletteChange: (key: keyof ThemePalette, hex: string) => void;
};

export function ThemePalettePanel({ draftConfig, onPaletteChange }: ThemePalettePanelProps) {
  const palette = resolveThemePalette(draftConfig);

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50/80 px-4 py-3" dir="rtl">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        ערכת צבעים
      </h3>
      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
        השינויים מתעדכנים מיד בתצוגה. שמירה דרך &quot;שמור שינויים&quot;.
      </p>
      <div className="space-y-4 max-h-[min(42vh,320px)] overflow-y-auto pr-0.5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {g.title}
            </p>
            <div className="space-y-2">
              {g.keys.map((key) => {
                const value = palette[key] ?? "#000000";
                return (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => onPaletteChange(key, e.target.value)}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded border border-slate-200 bg-white"
                      aria-label={LABELS[key]}
                    />
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(v) || /^[0-9a-fA-F]{6}$/.test(v)) {
                          onPaletteChange(key, v.startsWith("#") ? v : `#${v}`);
                        }
                      }}
                      className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs"
                      dir="ltr"
                    />
                    <span className="w-24 shrink-0 text-right text-[11px] text-slate-600 leading-tight">
                      {LABELS[key]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
