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
import { buildReminderMessage } from "@/lib/whatsapp/messages";
import { formatIsraelDateShort, formatIsraelTime } from "@/lib/datetime/formatIsraelTime";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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
    console.log("[BOOK_CREATE] firestore_read_fail", { siteId, bookingId, bookingPath: `sites/${siteId}/bookings/${bookingId}` });
    throw new Error("Booking not found");
  }

  console.log("[BOOK_CREATE] firestore_read_ok", { siteId, bookingId, bookingPath: `sites/${siteId}/bookings/${bookingId}` });
  const data = bookingSnap.data()!;
  const phoneResult = getBookingPhoneE164(data as Record<string, unknown>, "IL");
  if ("error" in phoneResult) {
    throw new Error(phoneResult.error);
  }
  const customerPhoneE164 = phoneResult.e164;
  const salonName = await getSiteSalonName(db, siteId);

  // Idempotent: skip sending if we already sent (avoid duplicate WhatsApp on retries)
  const alreadySent =
    data.confirmationSentAt != null ||
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
    confirmationSentAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Last-minute booking: if start is within 24h from now, send reminder immediately
  // so customer can confirm without waiting for the cron. Idempotent: we just set
  // whatsappStatus="booked"; reminder24hSentAt is still null. Cron will skip later
  // because we set reminder24hSentAt below.
  const nowMs = Date.now();
  const startMs = startAt.getTime();
  const diffMs = startMs - nowMs;

  if (diffMs > 0 && diffMs <= TWENTY_FOUR_HOURS_MS) {
    const timeStr = formatIsraelTime(startAt);
    const reminderBody = buildReminderMessage(salonName, timeStr);

    await sendWhatsApp({
      toE164: customerPhoneE164,
      body: reminderBody,
      bookingId,
      siteId,
      bookingRef: `sites/${siteId}/bookings/${bookingId}`,
      meta: { reminder_sent_immediately_due_to_last_minute_booking: true },
    });

    const statusBefore = (data.status as string) ?? "booked";
    if (process.env.NODE_ENV === "development") {
      console.log("[pendingStage] bookingId=" + bookingId + " status before=" + statusBefore + " (not writing status; only setting whatsappStatus=awaiting_confirmation)");
    }
    // Do NOT write Firestore `status` here. Pending is UI-derived from whatsappStatus.
    await bookingRef.update({
      whatsappStatus: "awaiting_confirmation",
      reminder24hSentAt: Timestamp.now(),
      confirmationRequestedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    if (process.env.NODE_ENV === "development") {
      console.log("[pendingStage] bookingId=" + bookingId + " status after=unchanged (still " + statusBefore + ")");
    }

    console.log("[onBookingCreated] reminder_sent_immediately_due_to_last_minute_booking: true", {
      siteId,
      bookingId,
      startAt: startAt.toISOString(),
      diffHours: (diffMs / (60 * 60 * 1000)).toFixed(2),
    });
  } else {
    console.log("[onBookingCreated] reminder_sent_immediately_due_to_last_minute_booking: false", {
      siteId,
      bookingId,
      reason: diffMs <= 0 ? "booking_in_past" : "start_more_than_24h_away",
    });
  }
}
