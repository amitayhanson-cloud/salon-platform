/**
 * Single source of truth for Firestore booking `status` when writing to sites/{siteId}/bookings/{id}.
 * Ensures status never becomes "confirmed" when whatsappStatus is "awaiting_confirmation" (pending).
 * Do NOT change UI rules or WhatsApp workflow; only use for write payloads.
 *
 * Write paths that set status:
 * - create: adminBookings.createAdminBooking, adminBookings.createAdminMultiServiceVisit, booking.saveBooking,
 *   booking.saveMultiServiceChain, admin-ai createBooking → use "create", default "booked".
 * - update: adminBookings.updateAdminBooking, adminBookings.updatePhase1Only → use "update"; need existing
 *   whatsappStatus so we never write "confirmed" for WhatsApp-pending bookings.
 * - confirm: whatsapp/bookingConfirmation.markBookingConfirmed only → use "confirm", writes "confirmed".
 * - cancel: booking.cancelBooking, adminBookings (phase2 remove) → use "cancel", writes "cancelled".
 * Reminder/pending path (runReminders, onBookingCreated) does NOT write status; only whatsappStatus.
 */

export type BookingStatusWriteContext = "create" | "update" | "confirm" | "cancel";

export interface DeriveStatusInput {
  /** Intended status from form/API (e.g. "booked" | "confirmed" | "cancelled"). */
  status?: string | null;
  /** From existing doc or same write payload. If "awaiting_confirmation", status must not be "confirmed". */
  whatsappStatus?: string | null;
}

/**
 * Returns the status value to write to Firestore.
 * - cancel: always "cancelled".
 * - confirm: always "confirmed" (explicit confirm action only).
 * - create: status ?? "booked" (never default to "confirmed").
 * - update: if whatsappStatus === "awaiting_confirmation", never write "confirmed" (use "booked"); else status ?? "booked".
 */
export function deriveBookingStatusForWrite(
  data: DeriveStatusInput,
  context: BookingStatusWriteContext,
  callsite?: string
): string {
  const status = data.status != null && String(data.status).trim() !== "" ? String(data.status).trim() : null;
  const ws = data.whatsappStatus != null && String(data.whatsappStatus).trim() !== "" ? String(data.whatsappStatus).trim() : null;
  const isAwaitingConfirmation = ws === "awaiting_confirmation";
  const isCancelled = status === "cancelled" || status === "canceled";

  if (context === "cancel") return "cancelled";
  if (context === "confirm") return "confirmed";

  if (context === "update" && isAwaitingConfirmation && (status === "confirmed" || status === "confirm")) {
    if (process.env.NODE_ENV === "development" && callsite) {
      console.warn(
        "[bookingStatusForWrite] Blocked status=confirmed for WhatsApp-pending booking; using booked. Callsite:",
        callsite
      );
    }
    return "booked";
  }

  if (status && (status === "cancelled" || status === "canceled")) return "cancelled";
  if (status === "confirmed") return "confirmed";
  return status ?? "booked";
}

/**
 * Call before writing a booking doc. In dev, logs a warning if payload has
 * whatsappStatus === "awaiting_confirmation" and status === "confirmed" (inconsistent).
 */
export function assertNoAwaitingConfirmationWithConfirmed(
  payload: { status?: unknown; whatsappStatus?: unknown },
  callsite: string
): void {
  if (process.env.NODE_ENV !== "development") return;
  const ws = payload.whatsappStatus != null && String(payload.whatsappStatus).trim() !== "" ? String(payload.whatsappStatus).trim() : null;
  const st = payload.status != null && String(payload.status).trim() !== "" ? String(payload.status).trim() : null;
  if (ws === "awaiting_confirmation" && (st === "confirmed" || st === "confirm")) {
    console.warn(
      "[bookingStatusForWrite] Inconsistent write: whatsappStatus=awaiting_confirmation but status=confirmed. Callsite:",
      callsite
    );
  }
}
