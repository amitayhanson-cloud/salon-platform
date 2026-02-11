export { sendWhatsApp, logInboundWhatsApp } from "./send";
export { normalizeE164, normalizeToE164, toWhatsAppTo, isValidE164 } from "./e164";
export { getBookingPhoneE164 } from "./getBookingPhone";
export type { BookingLike } from "./getBookingPhone";
export { validateTwilioSignature, getWebhookUrl } from "./validateSignature";
export { normalizeInboundBody, isYes, isNo } from "./yesNoDetection";
export {
  findNextAwaitingConfirmationByPhone,
  findNextBookingByPhoneWithStatus,
  markBookingConfirmed,
  markBookingCancelledByWhatsApp,
} from "./bookingConfirmation";
export type { SendWhatsAppParams } from "./send";
export type { BookingForConfirmation } from "./bookingConfirmation";
