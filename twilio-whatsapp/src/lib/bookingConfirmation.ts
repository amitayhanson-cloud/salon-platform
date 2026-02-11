/**
 * Find the single "next upcoming booking awaiting confirmation" for a phone number.
 * Used when user replies YES to map the reply to the correct booking (multi-tenant safe).
 */

import { pool } from "../db";

export type BookingForConfirmation = {
  id: string;
  salon_id: string;
  salon_name: string;
  appointment_time: Date;
  customer_phone_e164: string;
};

/**
 * Find the single most relevant booking for this phone:
 * - status = awaiting_confirmation
 * - appointment_time in the future
 * - customer_phone_e164 matches (normalized)
 * Order by appointment_time asc so we get the soonest one.
 * Returns null if none or multiple (caller can then ask "which time?").
 */
export async function findNextAwaitingConfirmationByPhone(
  customerPhoneE164: string
): Promise<BookingForConfirmation | null> {
  const normalized = (customerPhoneE164 || "").trim();
  if (!normalized) return null;

  // Assume bookings table has: id, salon_id, appointment_time, customer_phone_e164, status_whatsapp
  // and salons table has: id, name (or we join to get salon name)
  const result = await pool.query<BookingForConfirmation>(
    `SELECT b.id, b.salon_id, COALESCE(s.name, 'הסלון') AS salon_name,
            b.appointment_time, b.customer_phone_e164
     FROM bookings b
     LEFT JOIN salons s ON s.id = b.salon_id
     WHERE b.customer_phone_e164 = $1
       AND b.status_whatsapp = 'awaiting_confirmation'
       AND b.appointment_time > now()
     ORDER BY b.appointment_time ASC
     LIMIT 2`,
    [normalized]
  );

  const rows = result.rows;
  // Exactly one: return it. Zero or two+: return null (caller handles ambiguity).
  if (rows.length === 1) return rows[0];
  return null;
}

/**
 * Set booking to confirmed and set confirmation_received_at.
 */
export async function markBookingConfirmed(bookingId: string): Promise<void> {
  await pool.query(
    `UPDATE bookings
     SET status_whatsapp = 'confirmed', confirmation_received_at = now()
     WHERE id = $1`,
    [bookingId]
  );
}

/**
 * Optional: set booking to cancelled when user replies NO.
 */
export async function markBookingCancelled(bookingId: string): Promise<void> {
  await pool.query(
    `UPDATE bookings
     SET status_whatsapp = 'cancelled'
     WHERE id = $1`,
    [bookingId]
  );
}
