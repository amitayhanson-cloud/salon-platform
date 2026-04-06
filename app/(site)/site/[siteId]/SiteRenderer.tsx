"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { defaultSiteConfig, defaultThemeColors, defaultThemePalette } from "@/types/siteConfig";
import { themePaletteRootStyle } from "@/lib/themePalette";
import { BarberTemplate } from "@/components/templates/gentlemans-barber/BarberTemplate";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { subscribeSiteServices, migrateServicesFromSubcollection } from "@/lib/firestoreSiteServices";
import {
  getTemplateForConfig,
} from "@/lib/templateLibrary";
import HairLuxurySite from "./HairLuxurySite";
import type { Product } from "@/types/product";
import { subscribeSiteProducts } from "@/lib/firestoreProducts";
import { VogueNailsShell } from "@/components/templates/vogue-nails/VogueNailsShell";
import type { PublicSiteTemplateId } from "@/types/siteConfig";

function resolvePublicTemplateId(
  config: SiteConfig | null
): PublicSiteTemplateId {
  const id = config?.publicSiteTemplateId;
  if (id === "gentlemans-barber" || id === "vogue-nails" || id === "hair-luxury") {
    return id;
  }
  return "hair-luxury";
}

export default function SiteRenderer({ siteId }: { siteId: string }) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [services, setServices] = useState<SiteService[]>([]);
  const [visibleProducts, setVisibleProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    // Subscribe to Firestore config (realtime updates). Same doc path as admin save: sites/{siteId}.config
    const docPath = `sites/${siteId}`;
    if (process.env.NODE_ENV !== "production") {
      console.log("[SiteRenderer] CONFIG_LOAD", { docPath, field: "config" });
    }

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (cfg) {
          const configWithTheme: SiteConfig = {
            ...cfg,
            themeColors: cfg.themeColors || defaultThemeColors,
            themePalette: { ...defaultThemePalette, ...cfg.themePalette },
          };
          if (process.env.NODE_ENV !== "production") {
            console.log("[SiteRenderer] config from Firestore", {
              docPath,
              keys: Object.keys(cfg).filter((k) => k !== "siteServices"),
            });
          }
          setConfig(configWithTheme);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(`siteConfig:${siteId}`, JSON.stringify(cfg));
          }
        } else {
          if (typeof window !== "undefined") {
            const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as SiteConfig;
                const configWithTheme: SiteConfig = {
                  ...parsed,
                  themeColors: parsed.themeColors || defaultThemeColors,
                  themePalette: { ...defaultThemePalette, ...parsed.themePalette },
                };
                if (process.env.NODE_ENV !== "production") {
                  console.log("[SiteRenderer] config from localStorage (no Firestore doc)");
                }
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
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as SiteConfig;
              const configWithTheme: SiteConfig = {
                ...parsed,
                themeColors: parsed.themeColors || defaultThemeColors,
                themePalette: { ...defaultThemePalette, ...parsed.themePalette },
              };
              if (process.env.NODE_ENV !== "production") {
                console.log("[SiteRenderer] config from localStorage (error fallback)");
              }
              setConfig(configWithTheme);
            } catch (err) {
              console.error("[Site] failed to parse localStorage config", err);
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

  // Load services from services array (same source as admin Services page)
  useEffect(() => {
    if (!siteId) return;

    // Run migration on first load (non-blocking)
    migrateServicesFromSubcollection(siteId).catch((err) => {
      console.error("[SiteRenderer] Migration error (non-fatal)", err);
    });

    const unsubscribeServices = subscribeSiteServices(
      siteId,
      (svcs) => {
        if (process.env.NODE_ENV !== "production") {
          console.log("[SiteRenderer] services loaded", { path: `sites/${siteId}`, count: svcs.length });
        }
        // Only show enabled services, sorted by sortOrder then name
        const enabledServices = svcs
          .filter((s) => s.enabled !== false)
          .sort((a, b) => {
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
              return a.sortOrder - b.sortOrder;
            }
            return a.name.localeCompare(b.name);
          });
        
        setServices(enabledServices);
      },
      (err) => {
        console.error("[SiteRenderer] Failed to load services", err);
        setServices([]); // Fallback to empty array
      }
    );

    return () => {
      unsubscribeServices();
    };
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    const unsubscribe = subscribeSiteProducts(
      siteId,
      true,
      setVisibleProducts,
      (err) => console.error("[SiteRenderer] products subscription", err)
    );
    return unsubscribe;
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

  const publicTemplateId = resolvePublicTemplateId(config);

  const withPaletteVars = (inner: ReactNode) => (
    <div className="min-h-screen" style={themePaletteRootStyle(config)}>
      {inner}
    </div>
  );

  if (publicTemplateId === "gentlemans-barber") {
    return withPaletteVars(
      <BarberTemplate siteId={siteId} config={config} services={services} />
    );
  }

  if (publicTemplateId === "vogue-nails") {
    return withPaletteVars(
      <VogueNailsShell siteId={siteId} config={config} services={services} />
    );
  }

  const template = getTemplateForConfig(config);

  return withPaletteVars(
    <HairLuxurySite
      config={config}
      template={template}
      siteId={siteId}
      services={services}
      visibleProducts={visibleProducts}
    />
  );
}

