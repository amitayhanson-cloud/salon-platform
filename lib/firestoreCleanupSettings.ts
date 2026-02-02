import { db } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { cleanupSettingsDoc } from "./firestorePaths";

export type ExpiredAutoDelete = "off" | "daily" | "weekly" | "monthly" | "quarterly";

export type CleanupSettings = {
  expiredAutoDelete: ExpiredAutoDelete;
  updatedAt?: unknown; // serverTimestamp
};

const DEFAULT: CleanupSettings = {
  expiredAutoDelete: "off",
};

export async function getCleanupSettings(siteId: string): Promise<CleanupSettings> {
  if (!db) throw new Error("Firestore db not initialized");
  const snap = await getDoc(cleanupSettingsDoc(siteId));
  if (!snap.exists()) return DEFAULT;
  const data = snap.data() as Partial<CleanupSettings>;
  return {
    expiredAutoDelete: data.expiredAutoDelete ?? "off",
    updatedAt: data.updatedAt,
  };
}

export function subscribeCleanupSettings(
  siteId: string,
  onData: (settings: CleanupSettings) => void,
  onError?: (e: unknown) => void
): () => void {
  if (!db) throw new Error("Firestore db not initialized");
  return onSnapshot(
    cleanupSettingsDoc(siteId),
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT);
        return;
      }
      const data = snap.data() as Partial<CleanupSettings>;
      onData({
        expiredAutoDelete: data.expiredAutoDelete ?? "off",
        updatedAt: data.updatedAt,
      });
    },
    (err) => {
      console.error("[subscribeCleanupSettings]", err);
      onError?.(err);
    }
  );
}

export async function saveCleanupSettings(
  siteId: string,
  settings: Partial<Pick<CleanupSettings, "expiredAutoDelete">>
): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const { serverTimestamp } = await import("firebase/firestore");
  await setDoc(
    cleanupSettingsDoc(siteId),
    {
      ...settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
