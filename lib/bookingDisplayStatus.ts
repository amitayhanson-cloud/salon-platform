/**
 * Display status for WhatsApp confirmation lifecycle.
 * Used in admin UI to show a badge (label + color) from booking.whatsappStatus.
 */

export type WhatsappStatusDisplayColor = "green" | "yellow" | "red" | "blue";

export type BookingDisplayStatus = {
  label: string;
  color: WhatsappStatusDisplayColor;
};

/** Booking-like object with optional whatsappStatus */
export type BookingWithWhatsappStatus = { whatsappStatus?: string | null };

const STATUS_MAP: Record<string, BookingDisplayStatus> = {
  booked: { label: "🟢 נקבע", color: "blue" },
  awaiting_confirmation: { label: "🟡 ממתין לאישור", color: "yellow" },
  confirmed: { label: "🟢 מאושר", color: "green" },
  cancelled: { label: "🔴 בוטל", color: "red" },
};

/**
 * Returns label and color for the booking's WhatsApp status.
 * If whatsappStatus is missing (older bookings), defaults to "booked".
 */
export function getBookingDisplayStatus(booking: BookingWithWhatsappStatus): BookingDisplayStatus {
  const status = (booking?.whatsappStatus ?? "booked").trim() || "booked";
  return STATUS_MAP[status] ?? STATUS_MAP.booked;
}
