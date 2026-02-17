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
 * Normalize raw clientTypes to ClientTypeEntry[]. Ensures "regular" always exists.
 */
function normalizeClientTypesList(raw: ClientTypeEntry[] | undefined): ClientTypeEntry[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_CLIENT_TYPE_ENTRIES];
  }
  const entries = raw
    .filter((e) => e && typeof e.id === "string" && typeof e.labelHe === "string" && e.labelHe.trim())
    .map((e, i) => ({
      id: e.id.trim(),
      labelHe: e.labelHe.trim(),
      isSystem: e.id === REGULAR_CLIENT_TYPE_ID,
      sortOrder: typeof e.sortOrder === "number" ? e.sortOrder : i,
      createdAt: e.createdAt,
    }));
  const hasRegular = entries.some((e) => e.id === REGULAR_CLIENT_TYPE_ID);
  if (!hasRegular) {
    const regular = DEFAULT_CLIENT_TYPE_ENTRIES.find((e) => e.id === REGULAR_CLIENT_TYPE_ID)!;
    return [regular, ...entries].map((e, i) => ({ ...e, sortOrder: i }));
  }
  return entries.sort((a, b) => a.sortOrder - b.sortOrder);
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
 * Never writes to settings/booking.
 */
export async function saveClientTypes(siteId: string, clientTypes: ClientTypeEntry[]): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const cleaned = clientTypes
    .filter((e) => e && typeof e.id === "string" && typeof e.labelHe === "string" && e.labelHe.trim())
    .map((e, i) => ({
      id: e.id.trim(),
      labelHe: e.labelHe.trim(),
      isSystem: e.id === REGULAR_CLIENT_TYPE_ID,
      sortOrder: typeof e.sortOrder === "number" ? e.sortOrder : i,
      createdAt: e.createdAt,
    }));
  const hasRegular = cleaned.some((e) => e.id === REGULAR_CLIENT_TYPE_ID);
  if (!hasRegular) throw new Error("REGULAR_TYPE_REQUIRED");
  if (cleaned.length === 0) return;
  const payload = { clientTypes: cleaned };
  const sanitized = sanitizeForFirestore(payload) as ClientSettingsData;
  await setDoc(clientSettingsDoc(siteId), sanitized, { merge: true });
}

/**
 * Seed default client types when site has none. Writes to settings/clients only.
 */
export async function seedDefaultClientTypes(siteId: string): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const ref = clientSettingsDoc(siteId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as ClientSettingsData) : null;
  const raw = data?.clientTypes;
  if (Array.isArray(raw) && raw.length > 0) return;
  const payload = { clientTypes: DEFAULT_CLIENT_TYPE_ENTRIES };
  const sanitized = sanitizeForFirestore(payload) as ClientSettingsData;
  await setDoc(ref, sanitized, { merge: true });
}
