/**
 * Find multiple bookings awaiting confirmation for a phone (for selection menu).
 * Uses Firestore collection group: customerPhoneE164, whatsappStatus, startAt > now.
 * Server-only: Firebase Admin.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "./e164";

export type BookingChoice = {
  bookingRef: string;
  siteId: string;
  bookingId: string;
  startAt: Timestamp;
  siteName: string;
  serviceName?: string;
};

/**
 * Find up to `limit` bookings awaiting confirmation for this phone (startAt in the future).
 * Ordered by startAt asc. Used for multi-booking selection menu.
 */
export async function findBookingsAwaitingConfirmationByPhoneMulti(
  phoneE164: string,
  limit = 5
): Promise<BookingChoice[]> {
  const stripped = (phoneE164 || "").trim().replace(/^whatsapp:/, "");
  const e164 = normalizeE164(stripped, "IL");
  if (!e164) return [];

  const db = getAdminDb();
  const now = Timestamp.now();

  const snapshot = await db
    .collectionGroup("bookings")
    .where("customerPhoneE164", "==", e164)
    .where("whatsappStatus", "==", "awaiting_confirmation")
    .where("startAt", ">", now)
    .orderBy("startAt", "asc")
    .limit(limit)
    .get();

  const choices: BookingChoice[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const siteId = doc.ref.parent?.parent?.id ?? "";
    let siteName = "הסלון";
    if (siteId) {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      const config = siteSnap.data()?.config;
      siteName = config?.salonName ?? config?.whatsappBrandName ?? siteName;
    }
    const startAt =
      data.startAt instanceof Timestamp
        ? data.startAt
        : Timestamp.fromMillis((data.startAt?.seconds ?? 0) * 1000);
    const serviceName =
      typeof data.serviceName === "string"
        ? data.serviceName
        : typeof data.service === "string"
          ? data.service
          : undefined;

    choices.push({
      bookingRef: `sites/${siteId}/bookings/${doc.id}`,
      siteId,
      bookingId: doc.id,
      startAt,
      siteName,
      serviceName: serviceName || undefined,
    });
  }
  return choices;
}
