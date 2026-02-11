/**
 * POST /api/cron/whatsapp-reminders
 * 24-hour reminder job for external scheduler (e.g. cron-job.org).
 * Protected: ?secret=CRON_SECRET (query param only; no Authorization header).
 *
 * Window: startAt in [now+24h-30min, now+24h+30min). Idempotent: only sends when
 * whatsappStatus === "booked" and reminder24hSentAt is null/missing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { runReminders } from "@/lib/whatsapp/runReminders";

export const maxDuration = 60;

function checkCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const token = request.nextUrl.searchParams.get("secret");
  return token === secret;
}

function isIndexRequiredError(e: unknown): boolean {
  const code = (e as { code?: number }).code;
  const message = (e as { message?: string }).message ?? "";
  return code === 9 || message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
}

export async function POST(request: NextRequest) {
  if (!checkCronAuth(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const nowISO = new Date().toISOString();
  console.log("[whatsapp-reminders] cron run started", { timestamp: nowISO });

  try {
    const db = getAdminDb();
    const result = await runReminders(db);

    console.log("[whatsapp-reminders] bookings in window", result.bookingCount);
    result.details.forEach((d) => {
      console.log("[whatsapp-reminders] processed", { bookingRef: d.bookingRef, result: d.result });
    });
    console.log("[whatsapp-reminders] total sent", result.sent, "errors", result.errors);

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isIndexRequiredError(e)) {
      return NextResponse.json(
        {
          error: "Firestore index required",
          hint: "Create the composite index for bookings: whatsappStatus + startAt (collectionGroup). See docs/WHATSAPP_TWILIO.md and run: firebase deploy --only firestore:indexes",
          original: message,
        },
        { status: 500 }
      );
    }
    throw e;
  }
}
