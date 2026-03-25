/**
 * Per-site WhatsApp billing receipts. A Cloud Function increments dashboardCurrent
 * whatsapp stats when a doc is created here — keep writes aligned with real sends only.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export type WhatsAppAuditLogType =
  | "confirmation"
  | "reminder"
  | "broadcast"
  | "reply"
  | "outbound";

const KNOWN_TYPES = new Set<string>(["confirmation", "reminder", "broadcast", "reply", "outbound"]);

export type WriteWhatsAppAuditLogParams = {
  type: WhatsAppAuditLogType;
  bookingId?: string | null;
  bookingRef?: string | null;
  twilioMessageSid?: string | null;
  /** REST API (Twilio SDK) vs inbound webhook TwiML response */
  channel?: "api" | "twiml";
  /** Webhook resultStatus or other diagnostic */
  replyContext?: string | null;
};

export function inferAuditTypeFromSend(
  explicit: WhatsAppAuditLogType | undefined,
  meta: Record<string, unknown> | null | undefined
): WhatsAppAuditLogType {
  if (explicit && KNOWN_TYPES.has(explicit)) return explicit;
  const fromMeta =
    meta && typeof meta.auditType === "string" && KNOWN_TYPES.has(meta.auditType)
      ? (meta.auditType as WhatsAppAuditLogType)
      : null;
  if (fromMeta) return fromMeta;
  const automation = meta && typeof meta.automation === "string" ? meta.automation : "";
  if (automation === "booking_confirmation") return "confirmation";
  if (automation === "reminder_24h") return "reminder";
  if (automation === "owner_broadcast") return "broadcast";
  return "outbound";
}

/** TwiML outbound: opt-in confirmation uses the same template as API confirmation. */
export function inferAuditTypeFromTwiMLReply(resultStatus: string): WhatsAppAuditLogType {
  if (resultStatus === "opt_in_booking_confirmation") return "confirmation";
  return "reply";
}

export async function writeWhatsAppAuditLog(siteId: string, params: WriteWhatsAppAuditLogParams): Promise<void> {
  const id = siteId?.trim();
  if (!id) return;
  const db = getAdminDb();
  await db
    .collection("sites")
    .doc(id)
    .collection("whatsapp_logs")
    .add({
      type: params.type,
      createdAt: FieldValue.serverTimestamp(),
      twilioMessageSid: params.twilioMessageSid ?? null,
      bookingId: params.bookingId ?? null,
      bookingRef: params.bookingRef ?? null,
      channel: params.channel ?? "api",
      replyContext: params.replyContext ?? null,
    });
}

export function bookingIdFromBookingRef(ref: string | null | undefined): string | null {
  if (!ref || typeof ref !== "string") return null;
  const m = ref.trim().match(/\/bookings\/([^/]+)$/);
  return m ? m[1]! : null;
}
