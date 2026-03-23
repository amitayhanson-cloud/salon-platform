/**
 * Client Firestore: subscribe to sites/{siteId}/settings/whatsapp
 */

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import { normalizeWhatsAppSettingsDoc } from "@/lib/whatsapp/whatsappSettingsNormalize";

export function whatsAppSettingsDocRef(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "whatsapp");
}

export function subscribeWhatsAppSettings(
  siteId: string,
  onData: (settings: WhatsAppSettingsDoc) => void,
  onError?: (e: unknown) => void
) {
  if (!db) throw new Error("Firestore db not initialized");
  return onSnapshot(
    whatsAppSettingsDocRef(siteId),
    (snap) => {
      const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
      onData(normalizeWhatsAppSettingsDoc(raw));
    },
    (err) => onError?.(err)
  );
}
