/**
 * GET /api/cron/waitlist-expired-offers
 * Expires stale pending waitlist offers and re-triggers matching. Vercel Cron + Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronBearerSecret } from "@/lib/server/verifyCronBearer";
import { runWaitlistExpiredOfferSweep } from "@/lib/bookingWaitlist/waitlistOfferExpiry";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronBearerSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { expiredCount } = await runWaitlistExpiredOfferSweep();
    return NextResponse.json({ ok: true, expiredCount });
  } catch (e) {
    console.error("[cron/waitlist-expired-offers]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
