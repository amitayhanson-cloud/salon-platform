"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { defaultThemeColors } from "@/types/siteConfig";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { subscribeSiteServices, migrateServicesFromSubcollection } from "@/lib/firestoreSiteServices";
import WebsiteRenderer from "@/components/site/WebsiteRenderer";

const CALENO_PREVIEW_MESSAGE_TYPE = "CALENO_PREVIEW_UPDATE";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  const params = useParams();
  const siteId = (params?.siteId as string) ?? "";
  const [baselineConfig, setBaselineConfig] = useState<SiteConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<SiteConfig | null>(null);
  const [services, setServices] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(true);
  const originRef = useRef<string | null>(null);

  const displayConfig = draftConfig ?? baselineConfig;

  // Load baseline config from Firestore once (and keep subscription for when admin saves)
  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    if (typeof window !== "undefined") originRef.current = window.location.origin;

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (cfg) {
          const configWithTheme: SiteConfig = {
            ...cfg,
            themeColors: cfg.themeColors || defaultThemeColors,
          };
          setBaselineConfig(configWithTheme);
        } else {
          if (typeof window !== "undefined") {
            const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as SiteConfig;
                setBaselineConfig({
                  ...parsed,
                  themeColors: parsed.themeColors || defaultThemeColors,
                });
              } catch {
                setBaselineConfig(null);
              }
            } else {
              setBaselineConfig(null);
            }
          } else {
            setBaselineConfig(null);
          }
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [siteId]);

  // Load services (same as public site)
  useEffect(() => {
    if (!siteId) return;
    migrateServicesFromSubcollection(siteId).catch(() => {});
    const unsub = subscribeSiteServices(
      siteId,
      (svcs) => {
        const enabled = (svcs ?? [])
          .filter((s) => s?.enabled !== false)
          .sort((a, b) => {
            if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
            return (a.name ?? "").localeCompare(b.name ?? "");
          });
        setServices(enabled);
      },
      () => setServices([])
    );
    return () => unsub();
  }, [siteId]);

  // Listen for draft updates from admin panel (postMessage). No Firestore writes here.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== CALENO_PREVIEW_MESSAGE_TYPE || !event.data?.payload) return;
      const { templateKey: _tk, siteConfig: payloadConfig } = event.data.payload;
      if (!payloadConfig || typeof payloadConfig !== "object") return;
      if (event.data.payload.siteId !== siteId) return;
      if (originRef.current && event.origin !== originRef.current) return;
      const withTheme: SiteConfig = {
        ...payloadConfig,
        themeColors: payloadConfig.themeColors || defaultThemeColors,
      };
      setDraftConfig(withTheme);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [siteId]);

  if (!siteId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-right px-4">
        <p className="text-slate-600 text-sm">siteId חסר</p>
      </div>
    );
  }

  if (loading && !displayConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: defaultThemeColors.background }}>
        <p className="text-sm" style={{ color: defaultThemeColors.mutedText }}>טוען…</p>
      </div>
    );
  }

  if (!displayConfig) {
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

  const templateKey = (displayConfig as { templateKey?: string }).templateKey ?? "hair1";

  return (
    <WebsiteRenderer
      templateKey={templateKey}
      siteConfig={displayConfig}
      mode="preview"
      siteId={siteId}
      services={services}
    />
  );
}
