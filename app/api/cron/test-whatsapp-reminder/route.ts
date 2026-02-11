/**
 * POST /api/cron/test-whatsapp-reminder
 * Debug endpoint: show "should send reminder?" for a booking and optionally force-send.
 * Protected: CRON_SECRET (query ?secret= or Authorization: Bearer).
 *
 * Body: { bookingRef: "sites/SITE_ID/bookings/BOOKING_ID" } OR { siteId, bookingId }
 * Optional: { forceSend: true } to send the reminder now.
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getReminderWindow } from "@/lib/whatsapp/reminderWindow";
import { sendWhatsApp, normalizeE164 } from "@/lib/whatsapp";

export const maxDuration = 60;

function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const q = request.nextUrl.searchParams.get("secret");
  if (q === secret) return true;
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return token === secret;
}

function getBookingStartAt(data: Record<string, unknown>): Date | null {
  const raw = data.startAt ?? data.appointmentAt;
  if (!raw) return null;
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw && typeof (raw as { seconds: number }).seconds === "number")
    return new Date((raw as { seconds: number }).seconds * 1000);
  return null;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let siteId: string;
  let bookingId: string;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bookingRef = body?.bookingRef as string | undefined;
  if (bookingRef && typeof bookingRef === "string") {
    const parts = bookingRef.split("/");
    const sitesIdx = parts.indexOf("sites");
    if (sitesIdx >= 0 && parts[sitesIdx + 1] && parts[sitesIdx + 2] === "bookings" && parts[sitesIdx + 3]) {
      siteId = parts[sitesIdx + 1];
      bookingId = parts[sitesIdx + 3];
    } else {
      return NextResponse.json(
        { error: "bookingRef must be like sites/SITE_ID/bookings/BOOKING_ID" },
        { status: 400 }
      );
    }
  } else if (body?.siteId && body?.bookingId) {
    siteId = String(body.siteId);
    bookingId = String(body.bookingId);
  } else {
    return NextResponse.json(
      { error: "Provide bookingRef or { siteId, bookingId }" },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Booking not found", siteId, bookingId }, { status: 404 });
  }

  const data = snap.data()!;
  const startAt = getBookingStartAt(data);
  const { now, windowStart, windowEnd } = getReminderWindow();

  const nowTime = now.getTime();
  const startTime = startAt?.getTime() ?? 0;
  const diffHours = startAt ? (startTime - nowTime) / (60 * 60 * 1000) : null;
  const withinWindow =
    startAt != null &&
    startTime >= windowStart.getTime() &&
    startTime < windowEnd.getTime();

  const reminder24hSentAt = data.reminder24hSentAt;
  const whatsappStatus = data.whatsappStatus ?? "(missing)";

  const shouldSend =
    withinWindow &&
    whatsappStatus === "booked" &&
    (reminder24hSentAt == null || reminder24hSentAt === undefined);

  const result: Record<string, unknown> = {
    bookingRef: `sites/${siteId}/bookings/${bookingId}`,
    siteId,
    bookingId,
    now: now.toISOString(),
    startAt: startAt?.toISOString() ?? null,
    diffHours,
    withinWindow,
    reminder24hSentAtPresent: reminder24hSentAt != null,
    whatsappStatus,
    shouldSendReminder: shouldSend,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };

  const forceSend = body?.forceSend === true;

  if (forceSend) {
    if (!shouldSend) {
      result.forceSendSkipped = "shouldSendReminder is false; not sending";
      return NextResponse.json(result);
    }
    const rawPhone = data.customerPhoneE164 ?? data.customerPhone ?? data.phone ?? "";
    const customerPhoneE164 = rawPhone ? normalizeE164(String(rawPhone), "IL") : "";
    if (!customerPhoneE164) {
      result.forceSendSkipped = "no customer phone";
      return NextResponse.json(result);
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
        bookingId,
        siteId,
        bookingRef: `sites/${siteId}/bookings/${bookingId}`,
      });
      await ref.update({
        whatsappStatus: "awaiting_confirmation",
        confirmationRequestedAt: Timestamp.now(),
        reminder24hSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      result.forceSendSent = true;
    } catch (e) {
      result.forceSendError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(result);
}
