"use client";

import { useEffect, useState } from "react";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultThemeColors } from "@/types/siteConfig";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import {
  getTemplateForConfig,
} from "@/lib/templateLibrary";
import HairLuxurySite from "./HairLuxurySite";

export default function SiteRenderer({ siteId }: { siteId: string }) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    console.log("[Site] rendering siteId", siteId);

    // Subscribe to Firestore config (realtime updates)
    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (cfg) {
          // Ensure themeColors has defaults
          const configWithTheme: SiteConfig = {
            ...cfg,
            themeColors: cfg.themeColors || defaultThemeColors,
          };
          console.log("[SiteRenderer] config keys:", cfg ? Object.keys(cfg) : null);
          console.log("[SiteRenderer] reviews:", cfg?.reviews);
          console.log("[SiteRenderer] reviews count:", (cfg?.reviews?.length ?? 0));
          console.log("[SiteRenderer] extraPages:", cfg?.extraPages);
          console.log("[Site] config loaded from Firestore", {
            reviewsCount: cfg.reviews?.length ?? 0,
            faqsCount: cfg.faqs?.length ?? 0,
            extraPages: cfg.extraPages,
          });
          setConfig(configWithTheme);
          // Also sync to localStorage for fallback
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              `siteConfig:${siteId}`,
              JSON.stringify(cfg)
            );
          }
        } else {
          // Fallback to localStorage if Firestore doc doesn't exist
          console.log("[Site] Firestore doc not found, trying localStorage");
          if (typeof window !== "undefined") {
            const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as SiteConfig;
                const configWithTheme: SiteConfig = {
                  ...parsed,
                  themeColors: parsed.themeColors || defaultThemeColors,
                };
                console.log("[Site] config loaded from localStorage");
                setConfig(configWithTheme);
              } catch (e) {
                console.error("[Site] failed to parse localStorage config", e);
                setConfig(null);
              }
            } else {
              setConfig(null);
            }
          } else {
            setConfig(null);
          }
        }
        setLoading(false);
      },
      (e) => {
        console.error("[SiteRenderer] subscribe config failed", e);
        // Fallback to localStorage on error
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as SiteConfig;
              const configWithTheme: SiteConfig = {
                ...parsed,
                themeColors: parsed.themeColors || defaultThemeColors,
              };
              console.log("[Site] config loaded from localStorage (fallback)");
              setConfig(configWithTheme);
            } catch (e) {
              console.error("[Site] failed to parse localStorage config", e);
              setConfig(null);
            }
          } else {
            setConfig(null);
          }
        } else {
          setConfig(null);
        }
        setLoading(false);
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [siteId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: defaultThemeColors.background }}>
        <p className="text-sm" style={{ color: defaultThemeColors.mutedText }}>טוען…</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-right px-4" style={{ backgroundColor: defaultThemeColors.background }}>
        <h1 className="text-2xl font-bold mb-2" style={{ color: defaultThemeColors.text }}>
          האתר לא נמצא
        </h1>
        <p className="text-sm max-w-md" style={{ color: defaultThemeColors.mutedText }}>
          ייתכן שהקישור לא נכון או שהאתר עדיין לא נשמר.
        </p>
      </div>
    );
  }

  // Get template and render
  const template = getTemplateForConfig(config);

  return <HairLuxurySite config={config} template={template} siteId={siteId} />;
}

