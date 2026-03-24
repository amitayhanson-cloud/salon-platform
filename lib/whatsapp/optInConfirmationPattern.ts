/**
 * Detects the prefilled “ask for confirmation + directions” message from the booking success wa.me link.
 */

export function looksLikeCustomerBookingConfirmationRequest(body: string): boolean {
  const t = (body ?? "").trim();
  if (t.length < 12) return false;
  if (/אשמח לקבל אישור/u.test(t) && /פרטי הגעה/u.test(t)) return true;
  if (/אשמח לקבל אישור/u.test(t) && /תור שלי/u.test(t)) return true;
  return false;
}
