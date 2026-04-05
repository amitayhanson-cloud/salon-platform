/**
 * POST /api/internal/waitlist/trigger-from-release
 * Secured by `x-caleno-waitlist-secret` — used by Cloud Functions on booking delete (backup to app-side cascade).
 */

import { NextResponse } from "next/server";
import { bookingDocToFreedSlot } from "@/lib/bookingWaitlist/bookingDocToFreedSlot";
import { triggerWaitlistMatchForFreedSlot } from "@/lib/bookingWaitlist/triggerWaitlistMatch";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

export async function POST(request: Request) {
  const expected = process.env.CALENO_WAITLIST_INTERNAL_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const secret = request.headers.get("x-caleno-waitlist-secret")?.trim();
  if (secret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    siteId?: string;
    bookingData?: Record<string, unknown>;
  } | null;
  const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
  const bookingData = body?.bookingData;
  if (!siteId || !bookingData || typeof bookingData !== "object") {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }

  if (isFollowUpBooking(bookingData)) {
    return NextResponse.json({ ok: true, skipped: "follow_up" });
  }

  const slot = bookingDocToFreedSlot(bookingData);
  if (!slot) {
    return NextResponse.json({ ok: true, skipped: "no_slot" });
  }

  try {
    const r = await triggerWaitlistMatchForFreedSlot(siteId, slot);
    return NextResponse.json({ ok: true, notified: r.notified, entryId: r.entryId ?? null, reason: r.reason ?? null });
  } catch (e) {
    console.error("[internal/waitlist/trigger-from-release]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
