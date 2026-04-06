/**
 * Callable server-side hook: run after creating a booking doc in Firestore.
 * Fetches booking + salon name, sends confirmation WhatsApp, updates booking with
 * customerPhoneE164 and whatsappStatus "booked".
 *
 * Call from your booking-creation API/route or server action after writing the booking doc:
 *
 *   import { onBookingCreated } from "@/lib/onBookingCreated";
 *   await onBookingCreated(siteId, bookingId);
 *
 * Suppress post-booking WhatsApp (confirmation + last-minute reminder): set
 * `skipCustomerConfirmation: true` or `bookingSource: "waitlist"` on the booking doc
 * (waitlist accept flow uses both).
 *
 * Caleno stores bookings at: sites/{siteId}/bookings/{bookingId}
 * (siteId = salon/site id)
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  sendWhatsApp,
  getBookingPhoneE164,
  getTwilioTemplateContentSidFromEnv,
  WHATSAPP_SKIPPED_USAGE_LIMIT_SID,
} from "@/lib/whatsapp";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/templateRender";
import { renderBookingConfirmationMessageFromBookingData } from "@/lib/whatsapp/renderBookingConfirmationMessage";
import { getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import { setWaOptInPending } from "@/lib/whatsapp/waOptInPending";
import { skipPostBookingConfirmationBecauseReminderCovers } from "@/lib/whatsapp/postBookingConfirmationSkip";
import { getPublicBookingPageAbsoluteUrlForSite, withTrackingSource } from "@/lib/url";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";
import { refreshClientAutomatedStatusFromBooking } from "@/lib/server/clientAutomatedStatus";
import { markWaitlistEntriesBookedForNewBooking } from "@/lib/bookingWaitlist/resolveWaitlistAfterBooking";
import { buildWazeUrlFromAddress } from "@/lib/whatsapp/businessWaze";
import { buildAppointmentReminderTemplateVariables } from "@/lib/whatsapp/appointmentReminderTemplateVariables";
import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ISRAEL_TZ = "Asia/Jerusalem";

/**
 * During DST cutovers, upstream booking timestamps can be written with the previous offset.
 * Normalize display to Israel's *current* offset so reminder messages match today's wall clock.
 */
function normalizeToCurrentIsraelOffset(date: Date): Date {
  const nowOffsetMs = getTimezoneOffset(ISRAEL_TZ, new Date());
  const dateOffsetMs = getTimezoneOffset(ISRAEL_TZ, date);
  const offsetDeltaMs = nowOffsetMs - dateOffsetMs;
  return new Date(date.getTime() + offsetDeltaMs);
}

/** Tomorrow's date YYYY-MM-DD in Asia/Jerusalem. */
function getTomorrowIsrael(): string {
  const now = new Date();
  const today = getDateYMDInTimezone(now, ISRAEL_TZ);
  const [y, m, d] = today.split("-").map(Number);
  const tomorrowDate = new Date(y, m - 1, d + 1);
  return (
    tomorrowDate.getFullYear() +
    "-" +
    String(tomorrowDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(tomorrowDate.getDate()).padStart(2, "0")
  );
}

async function getSiteSalonNameAndWazeUrl(
  db: ReturnType<typeof getAdminDb>,
  siteId: string
): Promise<{ salonName: string; wazeUrl: string; slug: string | null }> {
  const siteSnap = await db.collection("sites").doc(siteId).get();
  const config = siteSnap.data()?.config;
  const salonName =
    String(config?.salonName ?? config?.whatsappBrandName ?? "הסלון").trim() || "הסלון";
  const wazeUrl = buildWazeUrlFromAddress(config?.address);
  const rawSlug = siteSnap.data()?.slug;
  const slug = typeof rawSlug === "string" && rawSlug.trim() ? rawSlug.trim() : null;
  return { salonName, wazeUrl, slug };
}

/**
 * After creating a booking doc, call this to send the immediate confirmation WhatsApp.
 * Updates the booking with customerPhoneE164 and whatsappStatus: "booked".
 *
 * @param siteId - Site/salon id (sites/{siteId}/bookings/...)
 * @param bookingId - Booking document id
 */
export async function onBookingCreated(siteId: string, bookingId: string): Promise<void> {
  const db = getAdminDb();
  const bookingRef = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    console.log("[BOOK_CREATE] firestore_read_fail", { siteId, bookingId, bookingPath: `sites/${siteId}/bookings/${bookingId}` });
    throw new Error("Booking not found");
  }

  console.log("[BOOK_CREATE] firestore_read_ok", { siteId, bookingId, bookingPath: `sites/${siteId}/bookings/${bookingId}` });
  const data = bookingSnap.data()!;
  const resolvedSiteIdForStatus =
    typeof data.siteId === "string" && data.siteId.trim() ? data.siteId.trim() : siteId;
  try {
    await refreshClientAutomatedStatusFromBooking(db, resolvedSiteIdForStatus, data as Record<string, unknown>);
  } catch (e) {
    console.warn("[onBookingCreated] refreshClientAutomatedStatusFromBooking", e);
  }

  try {
    await markWaitlistEntriesBookedForNewBooking(db, siteId, bookingId, data as Record<string, unknown>);
  } catch (e) {
    console.warn("[onBookingCreated] markWaitlistEntriesBookedForNewBooking", e);
  }

  const phoneResult = getBookingPhoneE164(data as Record<string, unknown>, "IL");
  if ("error" in phoneResult) {
    throw new Error(phoneResult.error);
  }
  const customerPhoneE164 = phoneResult.e164;

  const skipCustomerConfirmation =
    data.skipCustomerConfirmation === true || data.bookingSource === "waitlist";
  if (skipCustomerConfirmation) {
    await bookingRef.update({
      customerPhoneE164,
      whatsappStatus: "booked",
      updatedAt: Timestamp.now(),
    });
    console.log("[onBookingCreated] skip_customer_confirmation", {
      siteId,
      bookingId,
      bookingSource: data.bookingSource ?? null,
    });
    return;
  }

  const { salonName, slug } = await getSiteSalonNameAndWazeUrl(db, siteId);
  const waSettings = await getSiteWhatsAppSettings(siteId);
  const bookingPublicUrl = withTrackingSource(
    getPublicBookingPageAbsoluteUrlForSite(siteId, slug),
    "whatsapp"
  );
  const customerDisplayName = String(data.customerName ?? "").trim() || "לקוח/ה";

  // Idempotent: skip if confirmation already sent, opt-in already registered, or reminder flow advanced
  const alreadyProcessed =
    data.confirmationSentAt != null ||
    data.waOptInConfirmationRegisteredAt != null ||
    data.whatsappStatus === "awaiting_confirmation" ||
    data.whatsappStatus === "confirmed";
  if (alreadyProcessed) {
    return;
  }

  const startAt =
    data.startAt instanceof Timestamp
      ? data.startAt.toDate()
      : new Date((data.startAt?.seconds ?? 0) * 1000);
  const startAtForIsraelWallClock = normalizeToCurrentIsraelOffset(startAt);
  const date = formatInTimeZone(startAtForIsraelWallClock, ISRAEL_TZ, "dd/MM/yyyy");
  const timeStr = formatInTimeZone(startAtForIsraelWallClock, ISRAEL_TZ, "HH:mm");
  console.log("[onBookingCreated] israel_wall_time", {
    siteId,
    bookingId,
    startAtIso: startAt.toISOString(),
    startAtForIsraelWallClockIso: startAtForIsraelWallClock.toISOString(),
    nowIsrael: formatInTimeZone(new Date(), ISRAEL_TZ, "dd/MM/yyyy HH:mm"),
    bookingIsrael: `${date} ${timeStr}`,
    currentOffsetMinutes: getTimezoneOffset(ISRAEL_TZ, new Date()) / (60 * 1000),
    bookingOffsetMinutes: getTimezoneOffset(ISRAEL_TZ, startAt) / (60 * 1000),
  });

  const postMode = waSettings.postBookingConfirmationMode ?? "auto";
  const useWhatsAppOptIn = postMode === "whatsapp_opt_in";
  const skipDuplicatePostBookingConfirmation = skipPostBookingConfirmationBecauseReminderCovers({
    reminderEnabled: waSettings.reminderEnabled,
    startAt,
  });

  if (useWhatsAppOptIn) {
    if (waSettings.confirmationEnabled) {
      if (!skipDuplicatePostBookingConfirmation) {
        await bookingRef.update({
          customerPhoneE164,
          waOptInConfirmationRegisteredAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        await setWaOptInPending({
          customerPhoneE164,
          siteId,
          bookingId,
        });
      } else {
        await bookingRef.update({
          customerPhoneE164,
          whatsappStatus: "booked",
          updatedAt: Timestamp.now(),
        });
      }
    }
  } else {
    let confirmationSentOk = !waSettings.confirmationEnabled;
    if (waSettings.confirmationEnabled && !skipDuplicatePostBookingConfirmation) {
      // One sendWhatsApp per booking; logs in send.ts ("Final Payload Keys") are per API call.
      // If you see two HX512 lines, check for (a) client double-calling confirm-after-create or
      // (b) this block plus the last-minute reminder below — reminders use a different template SID.
      console.log("[onBookingCreated] sendWhatsApp booking_confirmation", {
        siteId,
        bookingId,
        contentSid: getTwilioTemplateContentSidFromEnv("booking_confirmed") ?? null,
      });
      // `body` is for Firestore / ops visibility only. Twilio Content uses `template.variables` only — never mix body into the REST payload for templates (63016).
      const messageBody = renderBookingConfirmationMessageFromBookingData(waSettings, {
        salonName,
        bookingPublicUrl,
        customerDisplayName,
        startAt,
        wazeUrl: "",
      });
      const { sid } = await sendWhatsApp({
        toE164: customerPhoneE164,
        body: messageBody,
        template: {
          name: "booking_confirmed",
          contentSid: getTwilioTemplateContentSidFromEnv("booking_confirmed"),
          language: "he",
          variables: {
            "1": customerDisplayName,
            "2": salonName,
            "3": date,
            "4": timeStr,
          },
        },
        bookingId,
        siteId,
        bookingRef: `sites/${siteId}/bookings/${bookingId}`,
        meta: { automation: "booking_confirmation", templateName: "booking_confirmed" },
      });
      confirmationSentOk = sid !== WHATSAPP_SKIPPED_USAGE_LIMIT_SID && sid !== "skipped-global-disabled";
      if (sid === WHATSAPP_SKIPPED_USAGE_LIMIT_SID) {
        console.warn("[onBookingCreated] confirmation not sent — monthly WhatsApp usage limit", { siteId, bookingId });
      }
    }
    const autoUpdate: Record<string, unknown> = {
      customerPhoneE164,
      whatsappStatus: "booked",
      updatedAt: Timestamp.now(),
    };
    if (confirmationSentOk) {
      autoUpdate.confirmationSentAt = Timestamp.now();
    }
    await bookingRef.update(autoUpdate);
  }

  // Last-minute booking: if start is within 24h from now, send reminder immediately
  // so customer can confirm without waiting for the cron. Idempotent: we just set
  // whatsappStatus="booked"; reminder24hSentAt is still null. Cron will skip later
  // because we set reminder24hSentAt below.
  const nowMs = Date.now();
  const startMs = startAt.getTime();
  const diffMs = startMs - nowMs;

  if (diffMs > 0 && diffMs <= TWENTY_FOUR_HOURS_MS) {
    if (waSettings.reminderEnabled) {
      console.log("[onBookingCreated] sendWhatsApp last_minute_reminder", {
        siteId,
        bookingId,
        contentSid: getTwilioTemplateContentSidFromEnv("appointment_reminder_v1") ?? null,
      });
      // `reminderBody` = log / preview only; Twilio reminder uses `contentVariables` from the helper below.
      const reminderBody = renderWhatsAppTemplate(waSettings.reminderTemplate, {
        שם_העסק: salonName,
        זמן_תור: timeStr,
        שם_לקוח: customerDisplayName,
        קישור_לתיאום: bookingPublicUrl,
        תאריך_תור: date,
        business_name: salonName,
        time: timeStr,
        client_name: customerDisplayName,
        link: bookingPublicUrl,
        date,
        custom_text: waSettings.reminderCustomText ?? "",
        waze_link: "",
      });
      const contentVariables = buildAppointmentReminderTemplateVariables({
        customerDisplayName,
        salonName,
        dateDisplay: date,
        timeDisplay: timeStr,
      });
      console.log("DEBUG_REMINDER_VARS:", JSON.stringify(contentVariables, null, 2));

      const { sid: reminderSid } = await sendWhatsApp({
        toE164: customerPhoneE164,
        body: reminderBody,
        template: {
          name: "appointment_reminder_v1",
          contentSid: getTwilioTemplateContentSidFromEnv("appointment_reminder_v1"),
          language: "he",
          variables: contentVariables,
        },
        bookingId,
        siteId,
        bookingRef: `sites/${siteId}/bookings/${bookingId}`,
        meta: {
          reminder_sent_immediately_due_to_last_minute_booking: true,
          automation: "reminder_24h",
          templateName: "appointment_reminder_v1",
        },
      });

      if (reminderSid === WHATSAPP_SKIPPED_USAGE_LIMIT_SID) {
        console.warn("[onBookingCreated] last-minute reminder not sent — monthly WhatsApp usage limit", {
          siteId,
          bookingId,
        });
      } else if (reminderSid !== "skipped-global-disabled") {
        const statusBefore = (data.status as string) ?? "booked";
        if (process.env.NODE_ENV === "development") {
          console.log("[pendingStage] bookingId=" + bookingId + " status before=" + statusBefore + " (not writing status; only setting whatsappStatus=awaiting_confirmation)");
        }
        await bookingRef.update({
          whatsappStatus: "awaiting_confirmation",
          reminder24hSentAt: Timestamp.now(),
          confirmationRequestedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        if (process.env.NODE_ENV === "development") {
          console.log("[pendingStage] bookingId=" + bookingId + " status after=unchanged (still " + statusBefore + ")");
        }
      }
    }

    console.log("[onBookingCreated] reminder_sent_immediately_due_to_last_minute_booking", {
      siteId,
      bookingId,
      startAt: startAt.toISOString(),
      diffHours: (diffMs / (60 * 60 * 1000)).toFixed(2),
      sent: waSettings.reminderEnabled,
    });
  } else {
    console.log("[onBookingCreated] reminder_sent_immediately_due_to_last_minute_booking: false", {
      siteId,
      bookingId,
      reason: diffMs <= 0 ? "booking_in_past" : "start_more_than_24h_away",
    });

    // Catch-up: booking is for TOMORROW (Israel); daily batch at 10:00 may have already run.
    // Send reminder now so late-created tomorrow bookings are not missed. Only for tomorrow, not beyond.
    if (diffMs > 0 && data.reminder24hSentAt == null) {
      const tomorrowIsrael = getTomorrowIsrael();
      const bookingDateIsrael = getDateYMDInTimezone(startAt, ISRAEL_TZ);
      if (bookingDateIsrael === tomorrowIsrael && waSettings.reminderEnabled) {
        console.log("[onBookingCreated] sendWhatsApp tomorrow_catchup_reminder", {
          siteId,
          bookingId,
          contentSid: getTwilioTemplateContentSidFromEnv("appointment_reminder_v1") ?? null,
        });
        const reminderBodyCatchup = renderWhatsAppTemplate(waSettings.reminderTemplate, {
          שם_העסק: salonName,
          זמן_תור: timeStr,
          שם_לקוח: customerDisplayName,
          קישור_לתיאום: bookingPublicUrl,
          תאריך_תור: date,
          business_name: salonName,
          time: timeStr,
          client_name: customerDisplayName,
          link: bookingPublicUrl,
          date,
          custom_text: waSettings.reminderCustomText ?? "",
          waze_link: "",
        });
        const contentVariables = buildAppointmentReminderTemplateVariables({
          customerDisplayName,
          salonName,
          dateDisplay: date,
          timeDisplay: timeStr,
        });
        console.log("DEBUG_REMINDER_VARS:", JSON.stringify(contentVariables, null, 2));
        const { sid: catchupSid } = await sendWhatsApp({
          toE164: customerPhoneE164,
          body: reminderBodyCatchup,
          template: {
            name: "appointment_reminder_v1",
            contentSid: getTwilioTemplateContentSidFromEnv("appointment_reminder_v1"),
            language: "he",
            variables: contentVariables,
          },
          bookingId,
          siteId,
          bookingRef: `sites/${siteId}/bookings/${bookingId}`,
          meta: {
            reminder_sent_immediately_tomorrow_catchup: true,
            automation: "reminder_24h",
            templateName: "appointment_reminder_v1",
          },
        });
        if (catchupSid === WHATSAPP_SKIPPED_USAGE_LIMIT_SID) {
          console.warn("[onBookingCreated] tomorrow catch-up reminder not sent — monthly WhatsApp usage limit", {
            siteId,
            bookingId,
          });
        } else if (catchupSid !== "skipped-global-disabled") {
          await bookingRef.update({
            whatsappStatus: "awaiting_confirmation",
            reminder24hSentAt: Timestamp.now(),
            confirmationRequestedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          console.log("[onBookingCreated] reminder_sent_tomorrow_catchup: true", {
            siteId,
            bookingId,
            bookingDateIsrael,
          });
        }
      }
    }
  }
}
