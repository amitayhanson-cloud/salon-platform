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
 * Find bookings awaiting confirmation for this phone.
 * - customerPhoneE164 == e164
 * - whatsappStatus == "awaiting_confirmation"
 * - startAt > now - 2 hours (tolerate small drift)
 * Order by startAt asc, limit 5.
 * Returns { bookings, count }. Use count 0/1/>1 for webhook flow.
 */
export async function findAwaitingConfirmationByPhone(
  customerPhoneE164: string
): Promise<{ bookings: BookingForConfirmation[]; count: number }> {
  const stripped = (customerPhoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return { bookings: [], count: 0 };

  const db = getAdminDb();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const cutoff = Timestamp.fromDate(twoHoursAgo);

  const snapshot = await db
    .collectionGroup("bookings")
    .where("customerPhoneE164", "==", e164)
    .where("whatsappStatus", "==", "awaiting_confirmation")
    .where("startAt", ">", cutoff)
    .orderBy("startAt", "asc")
    .limit(5)
    .get();

  const bookings: BookingForConfirmation[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const startAt =
      data.startAt instanceof Timestamp
        ? data.startAt.toDate()
        : new Date((data.startAt?.seconds ?? 0) * 1000);
    const siteId = doc.ref.parent?.parent?.id ?? "";
    let salonName = "הסלון";
    if (siteId) {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      const config = siteSnap.data()?.config;
      salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
    }
    bookings.push({
      id: doc.id,
      siteId,
      salonName,
      startAt,
      customerPhoneE164: data.customerPhoneE164 ?? e164,
    });
  }
  return { bookings, count: bookings.length };
}

/**
 * Find the single most relevant booking for this phone (for backward compatibility).
 * Returns null if none or multiple.
 */
export async function findNextAwaitingConfirmationByPhone(
  customerPhoneE164: string
): Promise<BookingForConfirmation | null> {
  const { bookings, count } = await findAwaitingConfirmationByPhone(customerPhoneE164);
  if (count !== 1) return null;
  return bookings[0];
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
 * Parse bookingRef "sites/{siteId}/bookings/{bookingId}" and fetch the booking if it exists
 * and whatsappStatus === "awaiting_confirmation". Returns null otherwise.
 */
export async function getBookingByRefIfAwaitingConfirmation(bookingRef: string): Promise<{
  siteId: string;
  bookingId: string;
  salonName: string;
  startAt: Date;
} | null> {
  const match = /^sites\/([^/]+)\/bookings\/([^/]+)$/.exec(bookingRef);
  if (!match) return null;
  const [, siteId, bookingId] = match;
  const db = getAdminDb();
  const doc = await db.collection("sites").doc(siteId).collection("bookings").doc(bookingId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.whatsappStatus !== "awaiting_confirmation") return null;
  const startAt =
    data.startAt instanceof Timestamp
      ? data.startAt.toDate()
      : new Date((data.startAt?.seconds ?? 0) * 1000);
  let salonName = "הסלון";
  const siteSnap = await db.collection("sites").doc(siteId).get();
  const config = siteSnap.data()?.config;
  salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
  return { siteId, bookingId, salonName, startAt };
}

/**
 * Set booking to cancelled (WhatsApp flow) when user replies NO.
 * Does NOT delete: sets status + archive fields so booking is removed from calendar
 * but remains in client history as cancelled.
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
      cancelledAt: serverTimestamp(),
      isArchived: true,
      archivedAt: serverTimestamp(),
      archivedReason: "customer_cancelled_via_whatsapp",
      updatedAt: serverTimestamp(),
    });
}
