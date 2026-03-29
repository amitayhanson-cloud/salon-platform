/**
 * Shared logic for day-before morning WhatsApp reminder cron.
 * Window: startAt in [tomorrow 00:00, day-after-tomorrow 00:00) Asia/Jerusalem.
 * Run once per day at 10:00 AM Asia/Jerusalem. Same eligibility: whatsappStatus "booked", reminder24hSentAt null.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { assertNoAwaitingConfirmationWithConfirmed } from "@/lib/bookingStatusForWrite";
import {
  sendWhatsApp,
  normalizeE164,
  getTwilioTemplateContentSidFromEnv,
  WHATSAPP_SKIPPED_USAGE_LIMIT_SID,
} from "@/lib/whatsapp";
import { getTomorrowReminderWindow } from "@/lib/whatsapp/reminderWindow";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/templateRender";
import { getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import { formatIsraelDateShort, formatIsraelTime } from "@/lib/datetime/formatIsraelTime";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";
import { getPublicBookingPageAbsoluteUrlForSite, withTrackingSource } from "@/lib/url";
import { buildAppointmentReminderTemplateVariables } from "@/lib/whatsapp/appointmentReminderTemplateVariables";

export type ReminderDetail = {
  bookingRef: string;
  startAt: string;
  phone: string;
  result: string;
};

export type RunRemindersResult = {
  sent: number;
  errors: number;
  skippedCount: number;
  bookingCount: number;
  serverNow: string;
  windowStart: string;
  windowEnd: string;
  details: ReminderDetail[];
};

function getBookingStartAt(data: Record<string, unknown>): Date | null {
  const raw = data.startAt ?? data.appointmentAt;
  if (!raw) return null;
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw && typeof (raw as { seconds: number }).seconds === "number")
    return new Date((raw as { seconds: number }).seconds * 1000);
  return null;
}

export async function runReminders(db: ReturnType<typeof getAdminDb>): Promise<RunRemindersResult> {
  const { now, nowISO, nowIsraelISO, windowStart, windowEnd, windowStartISO, windowEndISO } =
    getTomorrowReminderWindow();

  console.log("[whatsapp-reminders] run (tomorrow batch)", {
    now: nowISO,
    tomorrowStart: windowStartISO,
    tomorrowEnd: windowEndISO,
    nowIsrael: nowIsraelISO,
  });

  const startTs = Timestamp.fromDate(windowStart);
  const endTs = Timestamp.fromDate(windowEnd);

  const snapshot = await db
    .collectionGroup("bookings")
    .where("startAt", ">=", startTs)
    .where("startAt", "<", endTs)
    .where("whatsappStatus", "==", "booked")
    .get();

  const details: ReminderDetail[] = [];
  let sent = 0;
  let errors = 0;
  /** One reminder per group; skip if we already sent for this visitGroupId/parent chain. */
  const sentGroupKeys = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const siteId = doc.ref.parent?.parent?.id ?? "";
    const bookingRef = siteId ? `sites/${siteId}/bookings/${doc.id}` : doc.id;

    const startAt = getBookingStartAt(data);
    const startAtISO = startAt ? startAt.toISOString() : "unknown";

    const rawPhone = data.customerPhoneE164 ?? data.customerPhone ?? data.phone ?? "";
    const customerPhoneE164 = rawPhone ? normalizeE164(String(rawPhone), "IL") : "";

    const { groupKey } = await getRelatedBookingIds(siteId, doc.id);
    if (groupKey && sentGroupKeys.has(groupKey)) {
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: customerPhoneE164 || "(no phone)",
        result: "skipped: same group already sent reminder",
      });
      continue;
    }

    if (data.reminder24hSentAt != null) {
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: customerPhoneE164 || "(no phone)",
        result: "skipped: reminder24hSentAt already set",
      });
      continue;
    }
    if (data.confirmationRequestedAt != null) {
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: customerPhoneE164 || "(no phone)",
        result: "skipped: confirmationRequestedAt already set",
      });
      continue;
    }
    if (!customerPhoneE164) {
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: "",
        result: "skipped: no customer phone",
      });
      continue;
    }
    if (!siteId) {
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: customerPhoneE164,
        result: "skipped: missing siteId",
      });
      continue;
    }

    let salonName = "הסלון";
    let tenantSlug: string | null = null;
    try {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      const config = siteSnap.data()?.config;
      salonName =
        String(config?.salonName ?? config?.whatsappBrandName ?? salonName).trim() || salonName;
      const rawSlug = siteSnap.data()?.slug;
      tenantSlug = typeof rawSlug === "string" && rawSlug.trim() ? rawSlug.trim() : null;
    } catch {
      // keep default
    }

    const waSettings = await getSiteWhatsAppSettings(siteId);
    if (!waSettings.reminderEnabled) {
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: customerPhoneE164 || "(no phone)",
        result: "skipped: reminder disabled in site settings",
      });
      continue;
    }

    const timeStr = startAt ? formatIsraelTime(startAt) : "-";
    const dateStr = startAt ? formatIsraelDateShort(startAt) : "-";
    const customerDisplayName = String(data.customerName ?? "").trim() || "לקוח/ה";
    const trackedBookingUrl = withTrackingSource(
      getPublicBookingPageAbsoluteUrlForSite(siteId, tenantSlug),
      "whatsapp"
    );
    const reminderBody = renderWhatsAppTemplate(waSettings.reminderTemplate, {
      שם_העסק: salonName,
      זמן_תור: timeStr,
      שם_לקוח: customerDisplayName,
      תאריך_תור: dateStr,
      קישור_לתיאום: trackedBookingUrl,
      business_name: salonName,
      time: timeStr,
      client_name: customerDisplayName,
      date: dateStr,
      link: trackedBookingUrl,
      custom_text: waSettings.reminderCustomText ?? "",
      // Reminder messages intentionally omit Waze (even if an old template still contains {waze_link})
      waze_link: "",
    });

    try {
      const { sid } = await sendWhatsApp({
        toE164: customerPhoneE164,
        body: reminderBody,
        template: {
          name: "appointment_reminder_v1",
          contentSid: getTwilioTemplateContentSidFromEnv("appointment_reminder_v1"),
          language: "he",
          variables: buildAppointmentReminderTemplateVariables({
            customerDisplayName,
            salonName,
            dateDisplay: dateStr,
            timeDisplay: timeStr,
          }),
        },
        bookingId: doc.id,
        siteId,
        bookingRef: `sites/${siteId}/bookings/${doc.id}`,
        meta: { automation: "reminder_24h", templateName: "appointment_reminder_v1" },
      });

      if (sid === WHATSAPP_SKIPPED_USAGE_LIMIT_SID) {
        details.push({
          bookingRef,
          startAt: startAtISO,
          phone: customerPhoneE164,
          result: "skipped: monthly WhatsApp usage limit",
        });
        continue;
      }
      if (sid === "skipped-global-disabled") {
        details.push({
          bookingRef,
          startAt: startAtISO,
          phone: customerPhoneE164,
          result: "skipped: global WhatsApp automations disabled",
        });
        continue;
      }

      const { bookingIds, groupKey: gk } = await getRelatedBookingIds(siteId, doc.id);
      const statusBefore = (data.status as string) ?? "booked";
      if (process.env.NODE_ENV === "development") {
        console.log("[pendingStage] bookingId=" + doc.id + " status before=" + statusBefore + " (not writing status; keeping " + statusBefore + "; only setting whatsappStatus=awaiting_confirmation)");
      }
      // Do NOT write Firestore `status` here. Pending is UI-derived from whatsappStatus.
      // Only confirm button (or markBookingConfirmed) may set status to "confirmed".
      const payload = {
        whatsappStatus: "awaiting_confirmation" as const,
        confirmationRequestedAt: Timestamp.now(),
        reminder24hSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      assertNoAwaitingConfirmationWithConfirmed(
        { status: undefined, whatsappStatus: payload.whatsappStatus },
        "runReminders"
      );
      const batch = db.batch();
      for (const id of bookingIds) {
        batch.update(db.collection("sites").doc(siteId).collection("bookings").doc(id), payload);
      }
      await batch.commit();
      if (gk) sentGroupKeys.add(gk);
      if (process.env.NODE_ENV === "development") {
        console.log("[pendingStage] bookingId=" + doc.id + " status after=unchanged (still " + statusBefore + ")");
      }

      console.log("[whatsapp-reminders] status_propagated", {
        bookingId: doc.id,
        groupKey: gk ?? undefined,
        relatedCount: bookingIds.length,
        status: "awaiting_confirmation",
      });
      sent++;
      details.push({ bookingRef, startAt: startAtISO, phone: customerPhoneE164, result: "sent" });
    } catch (e) {
      errors++;
      const errMsg = e instanceof Error ? e.message : String(e);
      details.push({
        bookingRef,
        startAt: startAtISO,
        phone: customerPhoneE164,
        result: `error: ${errMsg}`,
      });
      console.error("[whatsapp-reminders] Failed for booking", doc.id, e);
    }
  }

  const skippedCount = snapshot.docs.length - sent - errors;
  console.log("[whatsapp-reminders] tomorrow batch result", {
    matched: snapshot.docs.length,
    processed: sent,
    skipped: skippedCount,
    errors,
    now: nowISO,
    tomorrowStart: windowStartISO,
    tomorrowEnd: windowEndISO,
  });

  return {
    sent,
    errors,
    skippedCount,
    bookingCount: snapshot.docs.length,
    serverNow: nowISO,
    windowStart: windowStartISO,
    windowEnd: windowEndISO,
    details,
  };
}
