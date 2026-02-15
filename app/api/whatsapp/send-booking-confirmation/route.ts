/**
 * POST /api/whatsapp/send-booking-confirmation
 * Call after creating a booking to send the immediate confirmation WhatsApp.
 * Delegates to onBookingCreated(siteId, bookingId).
 * Correlation logs: [BOOK_CREATE] with bookingAttemptId (visible in Vercel logs).
 */

import { NextRequest, NextResponse } from "next/server";
import { onBookingCreated } from "@/lib/onBookingCreated";

const MISSING_PHONE_MESSAGE = "Booking is missing customer phone number";

function bookingAttemptId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

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
  const attemptId = bookingAttemptId();
  const host = request.headers.get("host") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";

  let siteId: string | undefined;
  let bookingId: string | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    siteId = typeof body?.siteId === "string" ? body.siteId.trim() : undefined;
    bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : undefined;

    console.log("[BOOK_CREATE] start", {
      bookingAttemptId: attemptId,
      host,
      siteId: siteId ?? null,
      bookingId: bookingId ?? null,
      userAgent: userAgent.slice(0, 80),
    });

    if (!siteId || !bookingId) {
      console.log("[BOOK_CREATE] fail", {
        bookingAttemptId: attemptId,
        step: "validated_payload",
        errorMessage: "siteId and bookingId required",
      });
      return NextResponse.json({ ok: false, error: "siteId and bookingId required" }, { status: 400 });
    }

    const bookingPath = `sites/${siteId}/bookings/${bookingId}`;
    console.log("[BOOK_CREATE] resolved_site", {
      bookingAttemptId: attemptId,
      siteId,
      bookingPath,
    });
    console.log("[BOOK_CREATE] validated_payload", {
      bookingAttemptId: attemptId,
      siteId,
      bookingId,
    });

    const missingEnv = getMissingEnvVar();
    if (missingEnv) {
      const msg = `Missing env var: ${missingEnv}`;
      console.log("[BOOK_CREATE] fail", {
        bookingAttemptId: attemptId,
        step: "env_check",
        errorMessage: msg,
      });
      return NextResponse.json(
        { ok: false, error: msg, code: null },
        { status: 500 }
      );
    }

    console.log("[BOOK_CREATE] post_actions_start", { bookingAttemptId: attemptId });

    await onBookingCreated(siteId, bookingId);

    console.log("[BOOK_CREATE] whatsapp_send_ok", { bookingAttemptId: attemptId, bookingId, siteId });
    console.log("[BOOK_CREATE] done", { bookingAttemptId: attemptId, ok: true, bookingId, siteId });

    return NextResponse.json({ ok: true, bookingId, siteId });
  } catch (err) {
    const errObj = err as { message?: string; name?: string; code?: number | string; stack?: string };
    const message = errObj?.message ?? "Failed to send confirmation";
    const safeMessage = typeof message === "string" ? message : "Failed to send confirmation";

    console.log("[BOOK_CREATE] fail", {
      bookingAttemptId: attemptId,
      step: "post_actions",
      errorMessage: safeMessage,
      stack: errObj?.stack ?? undefined,
    });
    console.log("[BOOK_CREATE] whatsapp_send_fail", {
      bookingAttemptId: attemptId,
      error: safeMessage,
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
