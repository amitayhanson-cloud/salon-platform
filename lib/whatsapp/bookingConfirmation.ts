/**
 * Find the single "next upcoming booking awaiting confirmation" for a phone (multi-tenant safe).
 * Uses Firestore collection group query on "bookings".
 * Server-only: Firebase Admin.
 */

import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "./e164";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

export type BookingForConfirmation = {
  id: string;
  siteId: string;
  salonName: string;
  startAt: Date;
  customerPhoneE164: string;
};

/**
 * Find the single most relevant booking for this phone:
 * - whatsappStatus == "awaiting_confirmation"
 * - startAt > now
 * - customerPhoneE164 matches
 * Order by startAt asc, limit 2 (to detect ambiguity).
 * Returns null if none or multiple.
 */
export async function findNextAwaitingConfirmationByPhone(
  customerPhoneE164: string
): Promise<BookingForConfirmation | null> {
  const stripped = (customerPhoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return null;

  const db = getAdminDb();
  const now = Timestamp.now();

  const snapshot = await db
    .collectionGroup("bookings")
    .where("customerPhoneE164", "==", e164)
    .where("whatsappStatus", "==", "awaiting_confirmation")
    .where("startAt", ">", now)
    .orderBy("startAt", "asc")
    .limit(2)
    .get();

  const docs = snapshot.docs;
  if (docs.length !== 1) return null;

  const doc = docs[0];
  const data = doc.data();
  const startAt = data.startAt instanceof Timestamp ? data.startAt.toDate() : new Date(data.startAt?.seconds * 1000);
  // Site ID is the parent of the bookings subcollection: sites/{siteId}/bookings/{bookingId}
  const siteId = doc.ref.parent.parent?.id ?? "";

  let salonName = "הסלון";
  if (siteId) {
    const siteSnap = await db.collection("sites").doc(siteId).get();
    const config = siteSnap.data()?.config;
    salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
  }

  return {
    id: doc.id,
    siteId,
    salonName,
    startAt,
    customerPhoneE164: data.customerPhoneE164 ?? e164,
  };
}

/**
 * Find the single upcoming booking for this phone with the given whatsappStatus.
 * Used to detect "already confirmed" / "already cancelled" when user sends YES/NO again.
 */
export async function findNextBookingByPhoneWithStatus(
  customerPhoneE164: string,
  whatsappStatus: "confirmed" | "cancelled"
): Promise<BookingForConfirmation | null> {
  const stripped = (customerPhoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return null;

  const db = getAdminDb();
  const now = Timestamp.now();

  const snapshot = await db
    .collectionGroup("bookings")
    .where("customerPhoneE164", "==", e164)
    .where("whatsappStatus", "==", whatsappStatus)
    .where("startAt", ">", now)
    .orderBy("startAt", "asc")
    .limit(2)
    .get();

  const docs = snapshot.docs;
  if (docs.length !== 1) return null;

  const doc = docs[0];
  const data = doc.data();
  const startAt = data.startAt instanceof Timestamp ? data.startAt.toDate() : new Date(data.startAt?.seconds * 1000);
  const siteId = doc.ref.parent?.parent?.id ?? "";
  let salonName = "הסלון";
  if (siteId) {
    const siteSnap = await db.collection("sites").doc(siteId).get();
    const config = siteSnap.data()?.config;
    salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
  }
  return {
    id: doc.id,
    siteId,
    salonName,
    startAt,
    customerPhoneE164: data.customerPhoneE164 ?? e164,
  };
}

/**
 * Set booking to confirmed and set confirmationReceivedAt.
 * Booking is under sites/{siteId}/bookings/{bookingId}.
 */
export async function markBookingConfirmed(siteId: string, bookingId: string): Promise<void> {
  const db = getAdminDb();
  await db
    .collection("sites")
    .doc(siteId)
    .collection("bookings")
    .doc(bookingId)
    .update({
      whatsappStatus: "confirmed",
      confirmationReceivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/**
 * Set booking to cancelled (WhatsApp flow) when user replies NO.
 */
export async function markBookingCancelledByWhatsApp(siteId: string, bookingId: string): Promise<void> {
  const db = getAdminDb();
  await db
    .collection("sites")
    .doc(siteId)
    .collection("bookings")
    .doc(bookingId)
    .update({
      whatsappStatus: "cancelled",
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
}
