import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { REGULAR_CLIENT_TYPE_ID } from "@/types/bookingSettings";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

/**
 * Ensure `sites/{siteId}/clients/{normalizedPhone}` exists (Admin SDK).
 * Phone doc id matches client-side getOrCreateClient (strip spaces/parens/dashes).
 */
export async function getOrCreateClientAdmin(siteId: string, name: string, phoneRaw: string): Promise<string> {
  const normalizedPhone = phoneRaw.replace(/\s|-|\(|\)/g, "");
  if (!normalizedPhone) throw new Error("missing_phone");

  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("clients").doc(normalizedPhone);
  const snap = await ref.get();
  const payload: Record<string, unknown> = {
    name: name.trim() || "לקוח",
    phone: normalizedPhone,
    updatedAt: serverTimestamp(),
  };
  if (!snap.exists) {
    payload.createdAt = serverTimestamp();
    payload.clientTypeId = REGULAR_CLIENT_TYPE_ID;
  }
  await ref.set(sanitizeForFirestore(payload), { merge: true });
  return normalizedPhone;
}
