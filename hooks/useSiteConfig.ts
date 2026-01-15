"use client";

import { useEffect, useState } from "react";
import type { SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { normalizeServices } from "@/lib/normalizeServices";
import { defaultThemeColors } from "@/types/siteConfig";
import { saveSiteConfig } from "@/lib/firestoreSiteConfig";

export function useSiteConfig(siteId: string) {
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Load config
  useEffect(() => {
    if (typeof window === "undefined" || !siteId) return;

    try {
      const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
      if (raw) {
        const loaded = JSON.parse(raw);
        // Migrate from old ServiceItem[] format to new string[] format
        if (loaded.services && Array.isArray(loaded.services) && loaded.services.length > 0) {
          const firstService = loaded.services[0];
          if (typeof firstService === 'object' && firstService.name) {
            // Old format: ServiceItem[]
            const serviceNames = normalizeServices(
              loaded.services.map((s: any) => s.name).filter(Boolean)
            );
            const servicePricing: Record<string, number> = {};
            // Migrate prices from ServiceItem.price to servicePricing
            for (const s of loaded.services) {
              if (s.name && s.price && s.price > 0) {
                const normalizedName = String(s.name).trim();
                if (serviceNames.includes(normalizedName)) {
                  servicePricing[normalizedName] = s.price;
                }
              }
            }
            loaded.services = serviceNames;
            loaded.servicePricing = { ...(loaded.servicePricing || {}), ...servicePricing };
          }
        }
        const merged = { ...defaultSiteConfig, ...loaded };
        // Ensure themeColors has defaults
        if (!merged.themeColors) {
          merged.themeColors = defaultThemeColors;
        }
        setSiteConfig(merged);
      } else {
        setSiteConfig(defaultSiteConfig);
      }
    } catch (e) {
      console.error("Failed to parse siteConfig for admin", e);
      setSiteConfig(defaultSiteConfig);
    }
  }, [siteId]);

  const handleConfigChange = (updates: Partial<SiteConfig>) => {
    setSiteConfig((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const handleSaveConfig = async () => {
    if (!siteConfig || typeof window === "undefined" || !siteId) return;
    setIsSaving(true);
    setSaveMessage("");

    try {
      // Normalize field names (handle any legacy field names)
      const siteConfigAny = siteConfig as any;
      const normalizedReviews = siteConfig.reviews ?? siteConfigAny.reviewItems ?? siteConfigAny.customerReviews ?? [];
      const normalizedFaqs = siteConfig.faqs ?? siteConfigAny.faqItems ?? [];

      // Auto-add "reviews" to extraPages if reviews exist
      // Auto-add "faq" to extraPages if faqs exist
      const extraPages = new Set(siteConfig.extraPages ?? []);
      if ((normalizedReviews.length ?? 0) > 0) {
        extraPages.add("reviews");
      }
      if ((normalizedFaqs.length ?? 0) > 0) {
        extraPages.add("faq");
      }
      
      // Normalize services: trim, remove blanks, dedupe preserving order
      const currentServices = siteConfig.services || [];
      const serviceNames = normalizeServices(
        currentServices.map((s) => typeof s === 'string' ? s : (s as any).name)
      );
      
      // Build servicePricing map
      const servicePricing: Record<string, number> = {};
      const existingPricing = siteConfig.servicePricing || {};
      
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
        ...siteConfig,
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
