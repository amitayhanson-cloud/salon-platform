/**
 * Call this when a booking is created (from your main app or API).
 * - Persists customer_phone_e164 and status_whatsapp = 'booked'
 * - Sends immediate booking confirmation WhatsApp including salon name and time.
 *
 * Assumes the booking row already exists in PostgreSQL (your app created it).
 * If your app uses another DB (e.g. Firestore), you must sync the booking to
 * PostgreSQL first or call an API on this service that creates the booking + sends WhatsApp.
 */

import { pool } from "./db";
import { sendWhatsAppMessage } from "./services/whatsapp";
import { normalizeToE164 } from "./lib/e164";

export type OnBookingCreatedParams = {
  bookingId: string;
  salonId: string;
  salonName: string;
  customerPhone: string;
  /** ISO datetime or Date for appointment */
  appointmentTime: Date | string;
};

function formatTimeForMessage(d: Date): string {
  return d.toLocaleString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * After creating a booking in your DB, call this to:
 * 1) Update customer_phone_e164 and status_whatsapp = 'booked'
 * 2) Send confirmation WhatsApp with salon name and time
 */
export async function onBookingCreated(
  params: OnBookingCreatedParams
): Promise<{ sid: string }> {
  const {
    bookingId,
    salonId,
    salonName,
    customerPhone,
    appointmentTime,
  } = params;

  const e164 = normalizeToE164(customerPhone);
  const appointmentDate =
    typeof appointmentTime === "string" ? new Date(appointmentTime) : appointmentTime;
  const timeStr = formatTimeForMessage(appointmentDate);

  await pool.query(
    `UPDATE bookings
     SET customer_phone_e164 = $1, status_whatsapp = 'booked'
     WHERE id = $2`,
    [e164, bookingId]
  );

  const body = `${salonName} ✂️ ההזמנה שלך אושרה ל־${timeStr}. נשלח לך תזכורת 24 שעות לפני.`;
  return sendWhatsAppMessage({
    toE164: e164,
    body,
    bookingId,
    salonId,
  });
}
