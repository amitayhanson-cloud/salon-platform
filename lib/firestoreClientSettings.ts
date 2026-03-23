/**
 * Client settings: sites/{siteId}/settings/clients
 * Holds automated status rules + manual tags.
 */

import { db } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { ClientStatusRules, ClientStatusSettings, ManualClientTag } from "@/types/clientStatus";
import { DEFAULT_CLIENT_STATUS_RULES, DEFAULT_CLIENT_STATUS_SETTINGS } from "@/types/clientStatus";
import type { ClientTypeEntry } from "@/types/bookingSettings";
import { DEFAULT_CLIENT_TYPE_ENTRIES } from "@/types/bookingSettings";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

export function clientSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "clients");
}

export type ClientSettingsData = {
  statusRules?: Partial<ClientStatusRules>;
  manualTags?: ManualClientTag[];
};

function normalizeRules(raw: Partial<ClientStatusRules> | undefined): ClientStatusRules {
  const src = raw ?? {};
  const newMaxTotalBookings = Number(src.newMaxTotalBookings);
  const activeMinBookings = Number(src.activeMinBookings);
  const activeWindowDays = Number(src.activeWindowDays);
  const sleepingNoBookingsFor = Number(src.sleepingNoBookingsFor);
  const sleepingWindowUnit = src.sleepingWindowUnit === "months" ? "months" : "days";
  return {
    newMaxTotalBookings: Number.isFinite(newMaxTotalBookings) && newMaxTotalBookings >= 1 ? Math.floor(newMaxTotalBookings) : DEFAULT_CLIENT_STATUS_RULES.newMaxTotalBookings,
    activeMinBookings: Number.isFinite(activeMinBookings) && activeMinBookings >= 1 ? Math.floor(activeMinBookings) : DEFAULT_CLIENT_STATUS_RULES.activeMinBookings,
    activeWindowDays: Number.isFinite(activeWindowDays) && activeWindowDays >= 1 ? Math.floor(activeWindowDays) : DEFAULT_CLIENT_STATUS_RULES.activeWindowDays,
    sleepingNoBookingsFor: Number.isFinite(sleepingNoBookingsFor) && sleepingNoBookingsFor >= 1 ? Math.floor(sleepingNoBookingsFor) : DEFAULT_CLIENT_STATUS_RULES.sleepingNoBookingsFor,
    sleepingWindowUnit,
  };
}

function normalizeTags(raw: ManualClientTag[] | undefined): ManualClientTag[] {
  if (!Array.isArray(raw)) return DEFAULT_CLIENT_STATUS_SETTINGS.manualTags;
  const list = raw
    .filter((t) => t && typeof t.id === "string" && typeof t.label === "string" && t.label.trim())
    .map((t, i) => ({
      id: t.id.trim(),
      label: t.label.trim(),
      sortOrder: typeof t.sortOrder === "number" ? t.sortOrder : i,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return list;
}

export function normalizeClientStatusSettings(data: ClientSettingsData | null): ClientStatusSettings {
  return {
    statusRules: normalizeRules(data?.statusRules),
    manualTags: normalizeTags(data?.manualTags),
  };
}

export function subscribeClientStatusSettings(
  siteId: string,
  onData: (settings: ClientStatusSettings) => void,
  onError?: (e: unknown) => void
) {
  if (!db) throw new Error("Firestore db not initialized");
  return onSnapshot(
    clientSettingsDoc(siteId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as ClientSettingsData) : null;
      onData(normalizeClientStatusSettings(data));
    },
    (err) => onError?.(err)
  );
}

export async function saveClientStatusSettings(siteId: string, settings: ClientStatusSettings): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const payload: ClientSettingsData = {
    statusRules: normalizeRules(settings.statusRules),
    manualTags: normalizeTags(settings.manualTags),
  };
  const sanitized = sanitizeForFirestore(payload) as ClientSettingsData;
  await setDoc(clientSettingsDoc(siteId), sanitized, { merge: true });
}

export async function seedDefaultClientStatusSettings(siteId: string): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const ref = clientSettingsDoc(siteId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as ClientSettingsData) : null;
  if (!data?.statusRules || !Array.isArray(data.manualTags)) {
    const payload = normalizeClientStatusSettings(data);
    const sanitized = sanitizeForFirestore(payload) as ClientSettingsData;
    await setDoc(ref, sanitized, { merge: true });
  }
}

/**
 * Backward-compatible API used by older screens.
 * Returns fixed automated statuses as read-only options.
 */
export function subscribeClientTypes(
  siteId: string,
  onData: (clientTypes: ClientTypeEntry[]) => void,
  onError?: (e: unknown) => void
) {
  return subscribeClientStatusSettings(
    siteId,
    () => {
      onData(DEFAULT_CLIENT_TYPE_ENTRIES);
    },
    onError
  );
}

export async function saveClientTypes(_siteId?: string, _clientTypes?: ClientTypeEntry[]): Promise<void> {
  return Promise.resolve();
}

export async function seedDefaultClientTypes(siteId: string): Promise<void> {
  await seedDefaultClientStatusSettings(siteId);
}
