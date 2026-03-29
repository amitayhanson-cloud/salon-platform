export {
  sendWhatsApp,
  isWhatsAppOutboundDelivered,
  WHATSAPP_SKIPPED_GLOBAL_AUTOMATIONS_SID,
  WHATSAPP_SKIPPED_USAGE_LIMIT_SID,
  logInboundWhatsApp,
  logAmbiguousWhatsApp,
} from "./send";
export {
  APPOINTMENT_REMINDER_SID,
  BOOKING_CONFIRMED_SID,
  BROADCAST_SID,
  getTwilioTemplateContentSidFromEnv,
  resolveTwilioTemplateContentSid,
  type TwilioWhatsAppTemplateKind,
} from "./twilioContentTemplateSids";
export { normalizeE164, normalizeToE164, toWhatsAppTo, isValidE164 } from "./e164";
export { getBookingPhoneE164 } from "./getBookingPhone";
export type { BookingLike } from "./getBookingPhone";
export {
  validateTwilioSignature,
  getWebhookUrl,
  type WebhookUrlSource,
} from "./validateSignature";
export {
  normalizeInboundBody,
  isYes,
  isNo,
  normalizeInbound,
  isBroadcastWaitlistOptOut,
  intentFromInteractiveTemplate,
  type InboundIntent,
} from "./yesNoDetection";
export {
  findNextAwaitingConfirmationByPhone,
  findAwaitingConfirmationByPhone,
  findNextBookingByPhoneWithStatus,
  markBookingConfirmed,
  markBookingCancelledByWhatsApp,
  cancelBookingGroupByWhatsApp,
  getBookingByRefIfAwaitingConfirmation,
  applyCancelledByWhatsAppToBooking,
} from "./bookingConfirmation";
export { resolveBookingGroup, getRelatedBookingIds } from "./relatedBookings";
export type { ResolveBookingGroupResult } from "./relatedBookings";
export {
  findBookingsAwaitingConfirmationByPhoneMulti,
  type BookingChoice,
} from "./findBookingsAwaitingConfirmation";
export {
  createWhatsAppSession,
  getWhatsAppSession,
  deleteWhatsAppSession,
  type WhatsAppSession,
  type SessionIntent,
} from "./whatsappSessions";
export type { SendWhatsAppParams } from "./send";
export {
  writeWhatsAppAuditLog,
  inferAuditTypeFromSend,
  inferAuditTypeFromTwiMLReply,
  bookingIdFromBookingRef,
  type WhatsAppAuditLogType,
  type WriteWhatsAppAuditLogParams,
} from "./auditLog";
export {
  getWhatsAppUsageSnapshot,
  getWhatsAppUsageSnapshotForAdminUI,
  assertSiteWithinWhatsAppLimit,
  incrementWhatsAppUsage,
  siteIdFromBookingRef,
  DEFAULT_WHATSAPP_USAGE_LIMIT,
  type WhatsAppUsageSnapshot,
  type WhatsAppUsageCategory,
} from "./usage";
export type { BookingForConfirmation } from "./bookingConfirmation";
