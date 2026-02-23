"use client";

import { useEffect, useState } from "react";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { normalizeServices } from "@/lib/normalizeServices";
import { defaultThemeColors } from "@/types/siteConfig";
import { saveSiteConfig, subscribeSiteConfig } from "@/lib/firestoreSiteConfig";

function mergeWithDefaults(loaded: Record<string, unknown>): SiteConfig {
  const merged = { ...defaultSiteConfig, ...loaded };
  if (!merged.themeColors) merged.themeColors = defaultThemeColors;
  return merged as SiteConfig;
}

function migrateAndMerge(raw: string): SiteConfig | null {
  try {
    const loaded = JSON.parse(raw) as Record<string, unknown>;
    if (loaded.services && Array.isArray(loaded.services) && loaded.services.length > 0) {
      const first = loaded.services[0];
      if (typeof first === "object" && first && "name" in first) {
        const serviceNames = normalizeServices(
          (loaded.services as { name?: string }[]).map((s) => s?.name).filter(Boolean) as string[]
        );
        const servicePricing: Record<string, number> = { ...(loaded.servicePricing as Record<string, number>) };
        for (const s of loaded.services as { name?: string; price?: number }[]) {
          if (s?.name && s?.price && s.price > 0) {
            const n = String(s.name).trim();
            if (serviceNames.includes(n)) servicePricing[n] = s.price;
          }
        }
        loaded.services = serviceNames;
        loaded.servicePricing = servicePricing;
      }
    }
    return mergeWithDefaults(loaded);
  } catch {
    return null;
  }
}

export function useSiteConfig(siteId: string) {
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Load config from Firestore (source of truth); fallback to localStorage when doc missing or error
  useEffect(() => {
    if (typeof window === "undefined" || !siteId) return;

    if (process.env.NODE_ENV !== "production") {
      console.log("[useSiteConfig] SUBSCRIBE", { docPath: `sites/${siteId}`, field: "config" });
    }

    const unsubscribe = subscribeSiteConfig(
      siteId,
      (cfg) => {
        if (cfg) {
          const withTheme = { ...cfg, themeColors: cfg.themeColors || defaultThemeColors };
          setSiteConfig(withTheme);
          window.localStorage.setItem(`siteConfig:${siteId}`, JSON.stringify(cfg));
        } else {
          const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
          const merged = raw ? migrateAndMerge(raw) : defaultSiteConfig;
          setSiteConfig(merged ?? defaultSiteConfig);
          if (process.env.NODE_ENV !== "production" && !raw) {
            console.log("[useSiteConfig] No Firestore doc, using default config");
          }
        }
      },
      (e) => {
        console.error("[useSiteConfig] Firestore error", e);
        const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
        const merged = raw ? migrateAndMerge(raw) : defaultSiteConfig;
        setSiteConfig(merged ?? defaultSiteConfig);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  const handleConfigChange = (updates: Partial<SiteConfig>) => {
    setSiteConfig((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const handleSaveConfig = async (immediateUpdates?: Partial<SiteConfig>) => {
    // Ignore when Save button passes the click event as first argument
    if (
      immediateUpdates &&
      typeof immediateUpdates === "object" &&
      "nativeEvent" in immediateUpdates
    ) {
      immediateUpdates = undefined;
    }
    const base =
      siteConfig && immediateUpdates
        ? { ...siteConfig, ...immediateUpdates }
        : immediateUpdates
          ? { ...defaultSiteConfig, ...immediateUpdates }
          : siteConfig;
    if (!base || typeof window === "undefined" || !siteId) return;
    setIsSaving(true);
    setSaveMessage("");

    try {
      // Normalize field names (handle any legacy field names)
      const siteConfigAny = base as any;
      const normalizedReviews = base.reviews ?? siteConfigAny.reviewItems ?? siteConfigAny.customerReviews ?? [];
      const normalizedFaqs = base.faqs ?? siteConfigAny.faqItems ?? [];

      // Auto-add "reviews" to extraPages if reviews exist
      // Auto-add "faq" to extraPages if faqs exist
      const extraPages = new Set(base.extraPages ?? []);
      if ((normalizedReviews.length ?? 0) > 0) {
        extraPages.add("reviews");
      }
      if ((normalizedFaqs.length ?? 0) > 0) {
        extraPages.add("faq");
      }
      
      // Normalize services: trim, remove blanks, dedupe preserving order
      const currentServices = base.services || [];
      const serviceNames = normalizeServices(
        currentServices.map((s) => typeof s === 'string' ? s : (s as any).name)
      );
      
      // Build servicePricing map
      const servicePricing: Record<string, number> = {};
      const existingPricing = base.servicePricing || {};
      
      for (const serviceName of serviceNames) {
        if (existingPricing[serviceName] !== undefined) {
          servicePricing[serviceName] = existingPricing[serviceName];
        } else {
          // Fallback: migrate from ServiceItem format
          if (currentServices.length > 0 && typeof currentServices[0] === 'object') {
            for (const s of currentServices) {
              const name = typeof s === 'string' ? s : (s as any).name;
              if (name && name.trim() === serviceName) {
                const price = typeof s === 'object' ? ((s as any).price || 0) : 0;
                if (price > 0) {
                  servicePricing[serviceName] = price;
                }
              }
            }
          }
        }
      }
      
      const updatedConfig: SiteConfig = {
        ...base,
        services: serviceNames,
        servicePricing: servicePricing,
        reviews: normalizedReviews,
        faqs: normalizedFaqs,
        extraPages: Array.from(extraPages),
      };

      // Remove any legacy field names
      delete (updatedConfig as any).reviewItems;
      delete (updatedConfig as any).customerReviews;
      delete (updatedConfig as any).faqItems;

      // Save to Firestore
      await saveSiteConfig(siteId, updatedConfig);

      // Also save to localStorage
      window.localStorage.setItem(
        `siteConfig:${siteId}`,
        JSON.stringify(updatedConfig)
      );

      // Update local state
      setSiteConfig(updatedConfig);

      setSaveMessage("השינויים נשמרו בהצלחה");
    } catch (e) {
      console.error("Failed to save admin state", e);
      setSaveMessage("אירעה שגיאה בשמירה");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(""), 2500);
    }
  };

  return {
    siteConfig,
    isSaving,
    saveMessage,
    handleConfigChange,
    handleSaveConfig,
  };
}
