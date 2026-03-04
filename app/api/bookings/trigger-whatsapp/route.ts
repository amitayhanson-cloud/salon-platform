/**
 * POST /api/bookings/trigger-whatsapp
 * Triggers the same WhatsApp automation flow as public booking (onBookingCreated).
 * Used after admin creates a booking so admin-created bookings get identical confirmation + reminders.
 *
 * Security: authenticated, site owner only.
 * Idempotency: onBookingCreated skips if confirmation already sent (confirmationSentAt / whatsappStatus).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { onBookingCreated } from "@/lib/onBookingCreated";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : undefined;
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : undefined;

    if (!siteId || !bookingId) {
      return NextResponse.json({ ok: false, error: "siteId and bookingId required" }, { status: 400 });
    }

    const db = getAdminDb();
    const bookingRef = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    const data = snap.data()!;
    const docSiteId = typeof data.siteId === "string" ? data.siteId : null;
    const resolvedSiteId = docSiteId ?? siteId;
    if (docSiteId != null && docSiteId !== siteId) {
      return NextResponse.json({ ok: false, error: "siteId does not match booking" }, { status: 400 });
    }

    const forbidden = await assertSiteOwner(uid, resolvedSiteId);
    if (forbidden) return forbidden;

    await onBookingCreated(resolvedSiteId, bookingId);

    return NextResponse.json({ ok: true, bookingId, siteId: resolvedSiteId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bookings/trigger-whatsapp]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
