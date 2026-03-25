/**
 * Server-only: create users/{uid} for phone OTP signup (Admin SDK).
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function createPhonePrimaryUserDocumentAdmin(
  uid: string,
  fullName: string,
  phoneE164: string
): Promise<void> {
  const db = getAdminDb();
  const trimmedName = String(fullName).trim();
  await db.collection("users").doc(uid).set(
    {
      id: uid,
      email: "",
      name: trimmedName,
      phone: phoneE164,
      siteId: null,
      primaryLoginMethod: "phone",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: false }
  );
}
