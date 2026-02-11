/**
 * POST /api/cron/debug-reminder
 * Safe production debugging: returns whether a booking would match the reminder window.
 * Protected: ?secret=CRON_SECRET (query param only).
 *
 * Body: { siteId: string, bookingId: string }
 * Response: nowIso, startAtIso, diffMinutesTo24h, whatsappStatus, reminder24hSentAt exists?, wouldMatchWindow.
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getReminderWindow } from "@/lib/whatsapp/reminderWindow";

export const maxDuration = 30;

const ROUTE = "/api/cron/debug-reminder";

function getBookingStartAt(data: Record<string, unknown>): Date | null {
  const raw = data.startAt ?? data.appointmentAt;
  if (!raw) return null;
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw && typeof (raw as { seconds: number }).seconds === "number")
    return new Date((raw as { seconds: number }).seconds * 1000);
  return null;
}

export async function POST(request: NextRequest) {
  const secretParam = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const authOk = !!(expectedSecret && secretParam === expectedSecret);

  if (!authOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const siteId = body?.siteId as string | undefined;
  const bookingId = body?.bookingId as string | undefined;
  if (!siteId || !bookingId) {
    return NextResponse.json(
      { error: "Body must include { siteId, bookingId }" },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { error: "Booking not found", siteId, bookingId },
      { status: 404 }
    );
  }

  const data = snap.data()!;
  const startAt = getBookingStartAt(data);
  const { now, windowStart, windowEnd } = getReminderWindow();

  const nowTime = now.getTime();
  const startTime = startAt?.getTime() ?? 0;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const diffMinutesTo24h = startAt
    ? Math.round((startTime - nowTime - twentyFourHoursMs) / (60 * 1000))
    : null;

  const withinWindow =
    startAt != null &&
    startTime >= windowStart.getTime() &&
    startTime < windowEnd.getTime();

  const reminder24hSentAt = data.reminder24hSentAt;
  const whatsappStatus = (data.whatsappStatus as string) ?? "(missing)";

  const wouldMatchWindow =
    withinWindow &&
    whatsappStatus === "booked" &&
    (reminder24hSentAt == null || reminder24hSentAt === undefined);

  return NextResponse.json({
    nowIso: now.toISOString(),
    startAtIso: startAt?.toISOString() ?? null,
    diffMinutesTo24h,
    whatsappStatus,
    reminder24hSentAtExists: reminder24hSentAt != null,
    wouldMatchWindow,
    windowStartIso: windowStart.toISOString(),
    windowEndIso: windowEnd.toISOString(),
    siteId,
    bookingId,
  });
}
