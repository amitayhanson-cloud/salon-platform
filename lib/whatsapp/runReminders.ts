/**
 * Shared logic for 24h WhatsApp reminder cron.
 * Window: startAt in [now+24h-30min, now+24h+30min), whatsappStatus "booked", reminder24hSentAt null.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendWhatsApp, normalizeE164 } from "@/lib/whatsapp";
import { getReminderWindow } from "@/lib/whatsapp/reminderWindow";

export type ReminderDetail = {
  bookingRef: string;
  startAt: string;
  phone: string;
  result: string;
};

export type RunRemindersResult = {
  sent: number;
  errors: number;
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
    getReminderWindow();

  console.log("[whatsapp-reminders] run", {
    serverNow: nowISO,
    serverNowIsrael: nowIsraelISO,
    windowStart: windowStartISO,
    windowEnd: windowEndISO,
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

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const siteId = doc.ref.parent?.parent?.id ?? "";
    const bookingRef = siteId ? `sites/${siteId}/bookings/${doc.id}` : doc.id;

    const startAt = getBookingStartAt(data);
    const startAtISO = startAt ? startAt.toISOString() : "unknown";

    const rawPhone = data.customerPhoneE164 ?? data.customerPhone ?? data.phone ?? "";
    const customerPhoneE164 = rawPhone ? normalizeE164(String(rawPhone), "IL") : "";

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
    try {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      const config = siteSnap.data()?.config;
      salonName = config?.salonName ?? config?.whatsappBrandName ?? salonName;
    } catch {
      // keep default
    }

    const timeStr =
      startAt?.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) ?? "";

    try {
      await sendWhatsApp({
        toE164: customerPhoneE164,
        body: `${salonName} ✂️
תזכורת: התור שלך מחר בשעה ${timeStr}.
מגיע/ה?
השב/השיבי:
כן, אגיע
או
לא, בסוף לא אוכל להגיע`,
        bookingId: doc.id,
        siteId,
        bookingRef: `sites/${siteId}/bookings/${doc.id}`,
      });

      await doc.ref.update({
        whatsappStatus: "awaiting_confirmation",
        confirmationRequestedAt: Timestamp.now(),
        reminder24hSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
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

  console.log("[whatsapp-reminders] bookings in window", snapshot.docs.length, "sent", sent, "errors", errors);

  return {
    sent,
    errors,
    bookingCount: snapshot.docs.length,
    serverNow: nowISO,
    windowStart: windowStartISO,
    windowEnd: windowEndISO,
    details,
  };
}
