/**
 * Global platform settings (super-admin). Stored in Firestore platformSettings/global.
 * Server-only: uses Firebase Admin. Used for kill-switches (e.g. WhatsApp automations).
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

const COLLECTION = "platformSettings";
const DOC_ID = "global";

const CACHE_MS = 15_000; // 15s cache to avoid hammering Firestore

let cache: { enabled: boolean; at: number } | null = null;

export type PlatformSettings = {
  whatsappAutomationsEnabled: boolean;
  updatedAt: Timestamp;
  updatedBy?: string | null;
};

const DEFAULTS: Omit<PlatformSettings, "updatedAt"> = {
  whatsappAutomationsEnabled: true,
  updatedBy: null,
};

/**
 * Check if WhatsApp automations are enabled globally.
 * Cached for CACHE_MS. When doc is missing or read fails: default true, log loudly.
 */
export async function isWhatsAppAutomationEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.enabled;
  }
  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(DOC_ID);
    const snap = await ref.get();
    if (!snap.exists) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[platformSettings] platformSettings/global missing; defaulting whatsappAutomationsEnabled=true");
      }
      cache = { enabled: true, at: now };
      return true;
    }
    const data = snap.data() as Record<string, unknown> | undefined;
    const enabled = data?.whatsappAutomationsEnabled;
    const value = typeof enabled === "boolean" ? enabled : true;
    cache = { enabled: value, at: now };
    return value;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[platformSettings] Failed to read platformSettings/global", err);
    }
    cache = { enabled: true, at: now };
    return true;
  }
}

/**
 * Invalidate cache (call after updating settings so next read is fresh).
 */
export function invalidateWhatsAppAutomationCache(): void {
  cache = null;
}

/**
 * Get full platform settings. Returns defaults when doc missing.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      ...DEFAULTS,
      updatedAt: Timestamp.now(),
    };
  }
  const data = snap.data() as Record<string, unknown> | undefined;
  const updatedAt = data?.updatedAt as Timestamp | undefined;
  return {
    whatsappAutomationsEnabled:
      typeof data?.whatsappAutomationsEnabled === "boolean" ? data.whatsappAutomationsEnabled : true,
    updatedAt: updatedAt && typeof (updatedAt as { toDate?: () => Date }).toDate === "function" ? updatedAt : Timestamp.now(),
    updatedBy: typeof data?.updatedBy === "string" ? data.updatedBy : null,
  };
}

/**
 * Update platform settings. Caller must enforce super-admin auth.
 */
export async function updatePlatformSettings(updates: {
  whatsappAutomationsEnabled?: boolean;
  updatedBy?: string | null;
}): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(DOC_ID);
  const now = Timestamp.now();
  const payload: Record<string, unknown> = {
    updatedAt: now,
    ...(typeof updates.whatsappAutomationsEnabled === "boolean" && {
      whatsappAutomationsEnabled: updates.whatsappAutomationsEnabled,
    }),
    ...(updates.updatedBy !== undefined && { updatedBy: updates.updatedBy ?? null }),
  };
  await ref.set(payload, { merge: true });
  invalidateWhatsAppAutomationCache();
}
