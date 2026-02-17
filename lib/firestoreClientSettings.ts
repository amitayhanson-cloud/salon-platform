/**
 * Client types settings: sites/{siteId}/settings/clients
 * Only client types live here. Booking settings are in settings/booking.
 */

import { db } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { ClientTypeEntry } from "@/types/bookingSettings";
import {
  DEFAULT_CLIENT_TYPE_ENTRIES,
  REGULAR_CLIENT_TYPE_ID,
  SYSTEM_DEFAULT_CLIENT_TYPE_IDS,
} from "@/types/bookingSettings";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

export function clientSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "clients");
}

/** Raw shape stored in settings/clients */
export type ClientSettingsData = {
  clientTypes?: ClientTypeEntry[];
};

/**
 * Normalize raw clientTypes to ClientTypeEntry[]. Ensures all 5 system default types exist;
 * adds any missing from DEFAULT_CLIENT_TYPE_ENTRIES. System defaults are marked isSystemDefault: true.
 */
function normalizeClientTypesList(raw: ClientTypeEntry[] | undefined): ClientTypeEntry[] {
  const defaults = [...DEFAULT_CLIENT_TYPE_ENTRIES];
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return defaults.map((e, i) => ({ ...e, sortOrder: i }));
  }
  const entries = raw
    .filter((e) => e && typeof e.id === "string" && typeof e.labelHe === "string" && e.labelHe.trim())
    .map((e, i) => ({
      id: e.id.trim(),
      labelHe: e.labelHe.trim(),
      isSystem: SYSTEM_DEFAULT_CLIENT_TYPE_IDS.includes(e.id.trim() as (typeof SYSTEM_DEFAULT_CLIENT_TYPE_IDS)[number]),
      isSystemDefault: SYSTEM_DEFAULT_CLIENT_TYPE_IDS.includes(e.id.trim() as (typeof SYSTEM_DEFAULT_CLIENT_TYPE_IDS)[number]),
      sortOrder: typeof e.sortOrder === "number" ? e.sortOrder : i,
      createdAt: e.createdAt,
    }));
  const existingIds = new Set(entries.map((e) => e.id));
  for (const d of defaults) {
    if (!existingIds.has(d.id)) {
      entries.push({
        id: d.id,
        labelHe: d.labelHe,
        isSystem: true,
        isSystemDefault: true,
        sortOrder: entries.length,
        createdAt: d.createdAt,
      });
      existingIds.add(d.id);
    }
  }
  return entries.sort((a, b) => {
    const aDefault = a.isSystemDefault ? 0 : 1;
    const bDefault = b.isSystemDefault ? 0 : 1;
    if (aDefault !== bDefault) return aDefault - bDefault;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Subscribe to client types only (sites/{siteId}/settings/clients).
 * Does not touch settings/booking.
 */
export function subscribeClientTypes(
  siteId: string,
  onData: (clientTypes: ClientTypeEntry[]) => void,
  onError?: (e: unknown) => void
) {
  if (!db) throw new Error("Firestore db not initialized");
  return onSnapshot(
    clientSettingsDoc(siteId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as ClientSettingsData) : null;
      const list = normalizeClientTypesList(data?.clientTypes);
      onData(list);
    },
    (err) => onError?.(err)
  );
}

/**
 * Save client types to sites/{siteId}/settings/clients only.
 * System default types cannot be removed or renamed; missing defaults are merged in.
 */
export async function saveClientTypes(siteId: string, clientTypes: ClientTypeEntry[]): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const cleaned = clientTypes
    .filter((e) => e && typeof e.id === "string" && typeof e.labelHe === "string" && e.labelHe.trim())
    .map((e, i) => {
      const isDefault = SYSTEM_DEFAULT_CLIENT_TYPE_IDS.includes(e.id.trim() as (typeof SYSTEM_DEFAULT_CLIENT_TYPE_IDS)[number]);
      return {
        id: e.id.trim(),
        labelHe: e.labelHe.trim(),
        isSystem: isDefault,
        isSystemDefault: isDefault,
        sortOrder: typeof e.sortOrder === "number" ? e.sortOrder : i,
        createdAt: e.createdAt,
      };
    });
  const existingIds = new Set(cleaned.map((e) => e.id));
  for (const d of DEFAULT_CLIENT_TYPE_ENTRIES) {
    if (!existingIds.has(d.id)) {
      cleaned.push({
        id: d.id,
        labelHe: d.labelHe,
        isSystem: true,
        isSystemDefault: true,
        sortOrder: cleaned.length,
        createdAt: d.createdAt,
      });
      existingIds.add(d.id);
    } else {
      const idx = cleaned.findIndex((e) => e.id === d.id);
      if (idx !== -1) {
        cleaned[idx] = { ...cleaned[idx], isSystem: true, isSystemDefault: true };
      }
    }
  }
  const hasRegular = cleaned.some((e) => e.id === REGULAR_CLIENT_TYPE_ID);
  if (!hasRegular) throw new Error("REGULAR_TYPE_REQUIRED");
  const payload = { clientTypes: cleaned.sort((a, b) => a.sortOrder - b.sortOrder) };
  const sanitized = sanitizeForFirestore(payload) as ClientSettingsData;
  await setDoc(clientSettingsDoc(siteId), sanitized, { merge: true });
}

/**
 * Seed default client types: ensure all 5 system default types exist for the site.
 * Called on settings load. If any default is missing, merges them in and writes back.
 */
export async function seedDefaultClientTypes(siteId: string): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const ref = clientSettingsDoc(siteId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as ClientSettingsData) : null;
  const raw = data?.clientTypes;
  const normalized = normalizeClientTypesList(raw);
  const rawLength = Array.isArray(raw) ? raw.length : 0;
  if (normalized.length > rawLength || rawLength === 0) {
    const payload = { clientTypes: normalized };
    const sanitized = sanitizeForFirestore(payload) as ClientSettingsData;
    await setDoc(ref, sanitized, { merge: true });
  }
}
