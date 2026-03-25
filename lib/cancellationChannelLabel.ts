/**
 * Human-readable cancellation source for admin lists (archivedReason from cascade / WhatsApp / public book).
 */

const UNKNOWN = "לא צוין";

/** Labels keyed by {@link archivedReason} written in booking-cascade, WhatsApp, client archive, cleanup. */
const CHANNEL_HE: Record<string, string> = {
  admin_cancel: "ביטול באדמין",
  manual: "ביטול באדמין",
  customer_cancelled_via_whatsapp: "ביטול ב־WhatsApp",
  customer_cancelled_via_public_booking: "ביטול מדף ההזמנה",
  admin_delete: "מחיקה באדמין",
  admin_bulk_client_delete: "ביטול (מחיקת לקוח)",
  auto: "ביטול אוטומטי",
  dedupe_migration: "העברה לארכיון",
};

export function cancellationChannelLabelHe(archivedReason: string | null | undefined): string {
  const r = String(archivedReason ?? "").trim();
  if (!r) return UNKNOWN;
  return CHANNEL_HE[r] ?? `אחר (${r})`;
}

/**
 * Cell text: channel (admin / WhatsApp / booking page / …) and optional free-text note (e.g. admin reason).
 */
export function formatCancelledBookingChannelCell(
  archivedReason: string | null | undefined,
  cancellationNote: string | null | undefined
): string {
  const r = String(archivedReason ?? "").trim();
  const channel = cancellationChannelLabelHe(archivedReason);
  const note = (cancellationNote ?? "").trim();
  const hasCode = r.length > 0;
  if (hasCode && note) return `${channel} — ${note}`;
  if (hasCode) return channel;
  if (note) return note;
  return "—";
}
