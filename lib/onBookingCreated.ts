/**
 * Callable server-side hook: run after creating a booking doc in Firestore.
 * Fetches booking + salon name, sends confirmation WhatsApp, updates booking with
 * customerPhoneE164 and whatsappStatus "booked".
 *
 * Call from your booking-creation API/route or server action after writing the booking doc:
 *
 *   import { onBookingCreated } from "@/lib/onBookingCreated";
 *   await onBookingCreated(siteId, bookingId);
 *
 * Caleno stores bookings at: sites/{siteId}/bookings/{bookingId}
 * (siteId = salon/site id)
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendWhatsApp, getBookingPhoneE164 } from "@/lib/whatsapp";
import { formatIsraelDateShort, formatIsraelTime } from "@/lib/datetime/formatIsraelTime";

async function getSiteSalonName(db: ReturnType<typeof getAdminDb>, siteId: string): Promise<string> {
  const siteSnap = await db.collection("sites").doc(siteId).get();
  const config = siteSnap.data()?.config;
  return config?.salonName ?? config?.whatsappBrandName ?? "הסלון";
}

/**
 * After creating a booking doc, call this to send the immediate confirmation WhatsApp.
 * Updates the booking with customerPhoneE164 and whatsappStatus: "booked".
 *
 * @param siteId - Site/salon id (sites/{siteId}/bookings/...)
 * @param bookingId - Booking document id
 */
export async function onBookingCreated(siteId: string, bookingId: string): Promise<void> {
  const db = getAdminDb();
  const bookingRef = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    throw new Error("Booking not found");
  }

  const data = bookingSnap.data()!;
  const phoneResult = getBookingPhoneE164(data as Record<string, unknown>, "IL");
  if ("error" in phoneResult) {
    throw new Error(phoneResult.error);
  }
  const customerPhoneE164 = phoneResult.e164;
  const salonName = await getSiteSalonName(db, siteId);

  // Idempotent: skip sending if we already sent (avoid duplicate WhatsApp on retries)
  const alreadySent =
    (data.customerPhoneE164 && data.whatsappStatus) ||
    data.whatsappStatus === "booked" ||
    data.whatsappStatus === "awaiting_confirmation" ||
    data.whatsappStatus === "confirmed";
  if (alreadySent) {
    return;
  }

  const startAt =
    data.startAt instanceof Timestamp
      ? data.startAt.toDate()
      : new Date((data.startAt?.seconds ?? 0) * 1000);
  const date = formatIsraelDateShort(startAt);
  const time = formatIsraelTime(startAt);

  const messageBody = `${salonName} ✂️
תודה שקבעת תור!
התור שלך בתאריך ${date} בשעה ${time}.
נשלח לך תזכורת 24 שעות לפני.`;

  await sendWhatsApp({
    toE164: customerPhoneE164,
    body: messageBody,
    bookingId,
    siteId,
    bookingRef: `sites/${siteId}/bookings/${bookingId}`,
  });

  await bookingRef.update({
    customerPhoneE164,
    whatsappStatus: "booked",
    updatedAt: Timestamp.now(),
  });
}
