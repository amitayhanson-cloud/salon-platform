/**
 * POST /api/whatsapp/send-booking-confirmation
 * Call after creating a booking to send the immediate confirmation WhatsApp.
 * Delegates to onBookingCreated(siteId, bookingId).
 */

import { NextRequest, NextResponse } from "next/server";
import { onBookingCreated } from "@/lib/onBookingCreated";

const MISSING_PHONE_MESSAGE = "Booking is missing customer phone number";

function getMissingEnvVar(): string | null {
  if (!process.env.TWILIO_ACCOUNT_SID?.trim()) return "TWILIO_ACCOUNT_SID";
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) return "TWILIO_AUTH_TOKEN";
  if (!process.env.TWILIO_WHATSAPP_FROM?.trim()) return "TWILIO_WHATSAPP_FROM";
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const hasSplit =
    process.env.FIREBASE_PROJECT_ID?.trim() &&
    process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
    process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!json && !hasSplit) return "FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID+CLIENT_EMAIL+PRIVATE_KEY";
  return null;
}

export async function POST(request: NextRequest) {
  let siteId: string | undefined;
  let bookingId: string | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    siteId = typeof body?.siteId === "string" ? body.siteId.trim() : undefined;
    bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : undefined;

    if (!siteId || !bookingId) {
      return NextResponse.json({ ok: false, error: "siteId and bookingId required" }, { status: 400 });
    }

    console.log("[WA_CONFIRM] start", { siteId, bookingId });

    const missingEnv = getMissingEnvVar();
    if (missingEnv) {
      const msg = `Missing env var: ${missingEnv}`;
      console.error("[WA_CONFIRM] error", { message: msg, name: "EnvError", code: null, stack: undefined });
      return NextResponse.json(
        { ok: false, error: msg, code: null },
        { status: 500 }
      );
    }

    await onBookingCreated(siteId, bookingId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const errObj = err as { message?: string; name?: string; code?: number | string; stack?: string };
    const message = errObj?.message ?? "Failed to send confirmation";
    const safeMessage = typeof message === "string" ? message : "Failed to send confirmation";

    console.error("[WA_CONFIRM] error", {
      message: safeMessage,
      name: errObj?.name ?? "Error",
      code: errObj?.code ?? null,
      stack: errObj?.stack ?? undefined,
    });

    const status =
      safeMessage === "Booking not found"
        ? 404
        : safeMessage === MISSING_PHONE_MESSAGE || safeMessage === "Booking has no customer phone"
          ? 400
          : 500;

    return NextResponse.json(
      { ok: false, error: safeMessage, code: errObj?.code ?? null },
      { status }
    );
  }
}
