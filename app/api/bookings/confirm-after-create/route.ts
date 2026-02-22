/**
 * POST /api/bookings/confirm-after-create
 * PUBLIC PATH (no auth): Used only immediately after a customer creates a booking.
 * For admin flows, use POST /api/whatsapp/send-booking-confirmation with auth.
 *
 * Security:
 * - 400: Invalid payload
 * - 403: Validation failed (booking too old, already confirmed, wrong site)
 * - 404: Booking not found
 * - 429: Rate limited (per IP, per bookingId, per siteId)
 *
 * Guard:
 * - Booking must exist
 * - Booking must belong to intended site (siteId from path matches doc)
 * - createdAt <= 2 minutes
 * - confirmationSentAt must be null (not already sent)
 * - status must be "booked" or similar (pending)
 * - Atomic transaction: set confirmationSentAt, then send
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { onBookingCreated } from "@/lib/onBookingCreated";
import { checkRateLimit, getClientIp } from "@/lib/server/rateLimit";

const CREATED_WITHIN_MS = 2 * 60 * 1000; // 2 minutes
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_PER_IP = 20; // 20 confirm attempts per IP per 10 min
const RATE_LIMIT_PER_BOOKING = 2; // 2 per booking (retries)
const RATE_LIMIT_PER_SITE = 50; // 50 per site per 10 min

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const withToMillis = v as { toMillis?: () => number };
  if (typeof withToMillis.toMillis === "function") return withToMillis.toMillis();
  const withSeconds = v as { seconds?: number };
  if (typeof withSeconds.seconds === "number") return withSeconds.seconds * 1000;
  if (typeof v === "number") return v;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : undefined;
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : undefined;

    if (!siteId || !bookingId) {
      return NextResponse.json({ ok: false, error: "siteId and bookingId required" }, { status: 400 });
    }

    const ip = getClientIp(request);

    const [ipOk, bookingOk, siteOk] = await Promise.all([
      checkRateLimit(`confirm_ip:${ip}`, RATE_LIMIT_PER_IP, RATE_LIMIT_WINDOW_MS),
      checkRateLimit(`confirm_booking:${siteId}:${bookingId}`, RATE_LIMIT_PER_BOOKING, RATE_LIMIT_WINDOW_MS),
      checkRateLimit(`confirm_site:${siteId}`, RATE_LIMIT_PER_SITE, RATE_LIMIT_WINDOW_MS),
    ]);

    if (!ipOk.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests from this IP" },
        { status: 429 }
      );
    }
    if (!bookingOk.allowed) {
      return NextResponse.json(
        { ok: false, error: "Confirmation already sent or too many attempts" },
        { status: 429 }
      );
    }
    if (!siteOk.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests for this site" },
        { status: 429 }
      );
    }

    const db = getAdminDb();
    const bookingRef = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);

    const snap = await bookingRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    const data = snap.data()!;
    const docSiteId = typeof data.siteId === "string" ? data.siteId : null;
    if (docSiteId != null && docSiteId !== siteId) {
      return NextResponse.json({ ok: false, error: "Booking does not belong to this site" }, { status: 403 });
    }

    const createdMs = toMillis(data.createdAt);
    const now = Date.now();
    if (createdMs == null || now - createdMs > CREATED_WITHIN_MS) {
      return NextResponse.json(
        { ok: false, error: "Booking too old or missing createdAt" },
        { status: 403 }
      );
    }

    const alreadySent = data.confirmationSentAt != null;
    if (alreadySent) {
      return NextResponse.json(
        { ok: false, error: "Confirmation already sent" },
        { status: 403 }
      );
    }

    const status = typeof data.status === "string" ? data.status : "";
    const validStatuses = ["booked", "pending", "confirmed"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Booking status does not allow confirmation" },
        { status: 403 }
      );
    }

    await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(bookingRef);
      if (!tSnap.exists) throw new Error("Booking not found");
      const tData = tSnap.data()!;
      if (tData.confirmationSentAt != null) throw new Error("CONFLICT");
      tx.update(bookingRef, {
        confirmationSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const resolvedSiteId = docSiteId ?? siteId;
    await onBookingCreated(resolvedSiteId, bookingId);

    return NextResponse.json({ ok: true, bookingId, siteId: resolvedSiteId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "CONFLICT") {
      return NextResponse.json({ ok: false, error: "Confirmation already sent" }, { status: 403 });
    }
    console.error("[confirm-after-create]", msg);
    return NextResponse.json({ ok: false, error: "Failed to send confirmation" }, { status: 500 });
  }
}
