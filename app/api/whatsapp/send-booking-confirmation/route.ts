/**
 * POST /api/whatsapp/send-booking-confirmation
 * Call after creating a booking to send the immediate confirmation WhatsApp.
 * Delegates to onBookingCreated(siteId, bookingId).
 */

import { NextRequest, NextResponse } from "next/server";
import { onBookingCreated } from "@/lib/onBookingCreated";

const MISSING_PHONE_MESSAGE = "Booking is missing customer phone number";

export async function POST(request: NextRequest) {
  let siteId: string | undefined;
  let bookingId: string | undefined;
  try {
    const body = await request.json();
    siteId = body?.siteId;
    bookingId = body?.bookingId;

    if (!siteId || !bookingId) {
      return NextResponse.json({ error: "siteId and bookingId required" }, { status: 400 });
    }

    await onBookingCreated(siteId, bookingId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send confirmation";
    console.error("[send-booking-confirmation] failed", { siteId, bookingId, error: message });
    const status =
      message === "Booking not found"
        ? 404
        : message === MISSING_PHONE_MESSAGE || message === "Booking has no customer phone"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
