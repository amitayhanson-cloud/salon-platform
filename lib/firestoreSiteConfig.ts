import { db } from "@/lib/firebaseClient";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";

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
 */
export async function saveSiteConfig(siteId: string, config: SiteConfig): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const siteRef = doc(db, "sites", siteId);
  await setDoc(siteRef, { config }, { merge: true });
  console.log("[AdminServices] saved config to sites/" + siteId);
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
      const siteData = snap.data();
      const config = siteData?.config;
      onData(config ? (config as SiteConfig) : null);
    },
    (err) => {
      console.error("[subscribeSiteConfig] error", err);
      onError?.(err);
    }
  );
}

