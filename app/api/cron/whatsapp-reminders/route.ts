/**
 * GET/POST /api/cron/whatsapp-reminders
 * 24-hour reminder job. Protected: ?secret=CRON_SECRET (for Vercel Cron which cannot send headers).
 *
 * Same logic as send-whatsapp-reminders; use this URL in vercel.json so cron runs every 5 minutes.
 * Window: startAt in [now+24h-30min, now+24h+30min). Idempotent.
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

async function run(request: NextRequest) {
  if (!checkCronAuth(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const db = getAdminDb();
    const result = await runReminders(db);
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

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
