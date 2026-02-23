import { db } from "@/lib/firebaseClient";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

/**
 * Get Firestore document reference for site
 * Path: sites/{siteId}
 */
export function siteDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId);
}

/**
 * Save site config to Firestore
 * Stores config as a nested field on the site document
 * Path: sites/{siteId} with fields: config, updatedAt
 * Note: services array is stored separately at sites/{siteId}.services
 * Sanitizes payload so undefined is never written (Firestore rejects undefined).
 */
export async function saveSiteConfig(siteId: string, config: SiteConfig): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const siteRef = doc(db, "sites", siteId);
  const docPath = `sites/${siteId}`;

  // Don't save services in config - they're stored separately in services array
  const { siteServices, ...configWithoutServices } = config as SiteConfig & { siteServices?: unknown };
  const sanitized = sanitizeForFirestore(configWithoutServices);

  const payload = {
    config: sanitized,
    updatedAt: serverTimestamp(),
  };

  await setDoc(siteRef, payload, { merge: true });

  if (process.env.NODE_ENV !== "production") {
    const configKeys = sanitized && typeof sanitized === "object" ? Object.keys(sanitized as object) : [];
    console.log("[saveSiteConfig] WRITE_OK", {
      docPath,
      payloadKeys: ["config", "updatedAt"],
      configTopKeys: configKeys,
    });
  }
}

/**
 * Subscribe to site config changes (realtime)
 * Returns unsubscribe function
 * Reads config from sites/{siteId}.config
 */
export function subscribeSiteConfig(
  siteId: string,
  onData: (config: SiteConfig | null) => void,
  onError?: (e: unknown) => void
): () => void {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }
  return onSnapshot(
    siteDoc(siteId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const siteData = snap.data() as { config?: SiteConfig; slug?: string } | undefined;
      const config = siteData?.config;
      const slug = typeof siteData?.slug === "string" && siteData.slug.trim() ? siteData.slug.trim() : null;
      const merged: SiteConfig | null = config
        ? { ...(config as SiteConfig), slug: slug ?? config.slug ?? null }
        : null;
      onData(merged);
    },
    (err) => {
      console.error("[subscribeSiteConfig] error", err);
      onError?.(err);
    }
  );
}

