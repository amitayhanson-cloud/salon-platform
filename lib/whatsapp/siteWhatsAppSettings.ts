/**
 * Server-only: load / save WhatsApp settings from Firestore.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import { normalizeWhatsAppSettingsDoc } from "@/lib/whatsapp/whatsappSettingsNormalize";

export { normalizeWhatsAppSettingsDoc } from "@/lib/whatsapp/whatsappSettingsNormalize";

export async function getSiteWhatsAppSettings(siteId: string): Promise<WhatsAppSettingsDoc> {
  const db = getAdminDb();
  const snap = await db.collection("sites").doc(siteId).collection("settings").doc("whatsapp").get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  return normalizeWhatsAppSettingsDoc(data);
}

export async function saveSiteWhatsAppSettings(siteId: string, settings: WhatsAppSettingsDoc): Promise<void> {
  const db = getAdminDb();
  await db
    .collection("sites")
    .doc(siteId.trim())
    .collection("settings")
    .doc("whatsapp")
    .set(
      {
        ...settings,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
}
