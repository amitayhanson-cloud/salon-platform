/**
 * POST /api/booking-waitlist/confirm-offer-web
 * Public: confirm waitlist slot from web link (body: siteId, entryId, token).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { fulfillWaitlistOfferFromWebYes } from "@/lib/bookingWaitlist/fulfillOfferFromYes";

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT_PER_IP = 30;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request) ?? "unknown";
  const rl = await checkRateLimit(`waitlist-confirm-web:${ip}`, LIMIT_PER_IP, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    siteId?: string;
    entryId?: string;
    token?: string;
  } | null;
  const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
  const entryId = typeof body?.entryId === "string" ? body.entryId.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!siteId || !entryId || !token) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }

  try {
    const result = await fulfillWaitlistOfferFromWebYes(siteId, entryId, token);
    if (result.ok) {
      return NextResponse.json({ ok: true, bookingId: result.bookingId });
    }
    if (result.reason === "offer_expired") {
      return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });
    }
    if (result.reason === "bad_token") {
      return NextResponse.json({ ok: false, error: "bad_token" }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, error: result.reason, message: result.customerReply },
      { status: 422 }
    );
  } catch (e) {
    console.error("[booking-waitlist/confirm-offer-web]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
