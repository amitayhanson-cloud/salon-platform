/**
 * Shared: fill the post-booking confirmation template (same copy as automatic send / opt-in reply).
 */

import { Timestamp } from "firebase-admin/firestore";
import { formatIsraelDateShort, formatIsraelTime } from "@/lib/datetime/formatIsraelTime";
import { getPublicBookingPageUrlForSite } from "@/lib/url";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/templateRender";
import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";

export function renderBookingConfirmationMessageFromBookingData(
  waSettings: Pick<WhatsAppSettingsDoc, "confirmationTemplate" | "confirmationCustomText">,
  params: {
    salonName: string;
    bookingPublicUrl: string;
    customerDisplayName: string;
    startAt: Date;
    /** Include Waze link in `{waze_link}` (opt-in inbound reply); automatic send often passes "". */
    wazeUrl: string;
  }
): string {
  const date = formatIsraelDateShort(params.startAt);
  const time = formatIsraelTime(params.startAt);
  const templateVars = {
    שם_העסק: params.salonName,
    תאריך_תור: date,
    זמן_תור: time,
    קישור_לתיאום: params.bookingPublicUrl,
    שם_לקוח: params.customerDisplayName,
    business_name: params.salonName,
    date,
    time,
    link: params.bookingPublicUrl,
    client_name: params.customerDisplayName,
    custom_text: waSettings.confirmationCustomText ?? "",
    waze_link: params.wazeUrl,
  };
  return renderWhatsAppTemplate(waSettings.confirmationTemplate, templateVars);
}

export function bookingStartAtFromFirestore(data: Record<string, unknown>): Date | null {
  const s = data.startAt;
  if (s instanceof Timestamp) return s.toDate();
  if (s && typeof s === "object" && "seconds" in s && typeof (s as { seconds: number }).seconds === "number") {
    return new Date((s as { seconds: number }).seconds * 1000);
  }
  return null;
}

