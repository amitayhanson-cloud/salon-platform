/**
 * 24-hour reminder job: find bookings in the 24h–24h+5min window,
 * send reminder WhatsApp, set status = awaiting_confirmation and confirmation_requested_at.
 * Idempotent: only sends if not already sent (confirmation_requested_at IS NULL).
 */

import { pool } from "../db";
import { sendWhatsAppMessage } from "../services/whatsapp";

type BookingToRemind = {
  id: string;
  salon_id: string;
  salon_name: string;
  customer_phone_e164: string;
  appointment_time: Date;
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Find bookings that:
 * - appointment_time between now+24h and now+24h+5min
 * - status_whatsapp in ('booked', 'awaiting_confirmation') and confirmation_requested_at IS NULL
 *   (so we don't send duplicate reminders)
 */
async function getBookingsDueForReminder(): Promise<BookingToRemind[]> {
  const result = await pool.query<BookingToRemind>(
    `SELECT b.id, b.salon_id, COALESCE(s.name, 'הסלון') AS salon_name,
            b.customer_phone_e164, b.appointment_time
     FROM bookings b
     LEFT JOIN salons s ON s.id = b.salon_id
     WHERE b.appointment_time BETWEEN (now() + interval '24 hours')
                                 AND (now() + interval '24 hours 5 minutes')
       AND b.status_whatsapp IN ('booked', 'awaiting_confirmation')
       AND b.confirmation_requested_at IS NULL
       AND b.customer_phone_e164 IS NOT NULL
     ORDER BY b.appointment_time ASC`
  );
  return result.rows;
}

/**
 * Send reminder and set awaiting_confirmation + confirmation_requested_at.
 */
export async function runReminderJob(): Promise<{ sent: number; errors: number }> {
  const bookings = await getBookingsDueForReminder();
  let sent = 0;
  let errors = 0;

  for (const b of bookings) {
    try {
      const timeStr = formatTime(b.appointment_time);
      const body = `${b.salon_name} ✂️ תזכורת: התור שלך מחר ב־${timeStr}. Reply YES to confirm.`;
      await sendWhatsAppMessage({
        toE164: b.customer_phone_e164,
        body,
        bookingId: b.id,
        salonId: b.salon_id,
      });
      await pool.query(
        `UPDATE bookings
         SET status_whatsapp = 'awaiting_confirmation', confirmation_requested_at = now()
         WHERE id = $1`,
        [b.id]
      );
      sent++;
    } catch (e) {
      console.error("[reminderJob] Failed for booking", b.id, e);
      errors++;
    }
  }

  return { sent, errors };
}
