/**
 * When a booking starts within the next 24h and reminders are enabled, the immediate
 * reminder (sent from onBookingCreated) already carries confirmation-style info — skip
 * duplicate post-booking confirmation (auto send or wa.me opt-in).
 */

export const POST_BOOKING_REMINDER_COVERS_CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function bookingStartIsWithinWindowFromNow(startAt: Date, nowMs: number, windowMs: number): boolean {
  const diffMs = startAt.getTime() - nowMs;
  return diffMs > 0 && diffMs <= windowMs;
}

/** True → do not send auto confirmation WhatsApp and do not register wa.me opt-in; reminder flow applies. */
export function skipPostBookingConfirmationBecauseReminderCovers(params: {
  reminderEnabled: boolean;
  startAt: Date;
  nowMs?: number;
}): boolean {
  if (!params.reminderEnabled) return false;
  const now = params.nowMs ?? Date.now();
  return bookingStartIsWithinWindowFromNow(
    params.startAt,
    now,
    POST_BOOKING_REMINDER_COVERS_CONFIRMATION_WINDOW_MS
  );
}
