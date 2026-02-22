/**
 * POST /api/whatsapp/send-booking-confirmation
 * ADMIN PATH (authenticated only): Send WhatsApp confirmation for a booking.
 * For public booking flow, use POST /api/bookings/confirm-after-create instead.
 *
 * Security:
 * - 401: No/invalid Firebase ID token
 * - 403: User does not own the site
 * - 404: Booking or site not found
 * - 409: Confirmation already sent (confirmationSentAt set)
 * - 429: Rate limited
 *
 * Flow:
 * - Verify token, extract uid
 * - Load booking by siteId + bookingId; derive siteId from booking (validate match)
 * - assertSiteOwner(uid, siteId)
 * - Atomic: transaction checks confirmationSentAt is null, sets it
 * - Call onBookingCreated
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { onBookingCreated } from "@/lib/onBookingCreated";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { checkRateLimit } from "@/lib/server/rateLimit";

const RATE_LIMIT_PER_BOOKING = 2; // 2 attempts per booking per 10 min (retries)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

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

    const { allowed, retryAfterMs } = await checkRateLimit(
      `confirm_admin:${resolvedSiteId}:${bookingId}`,
      RATE_LIMIT_PER_BOOKING,
      RATE_LIMIT_WINDOW_MS
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests", retryAfterSeconds: Math.ceil((retryAfterMs ?? 0) / 1000) },
        { status: 429, headers: retryAfterMs ? { "Retry-After": String(Math.ceil((retryAfterMs ?? 0) / 1000)) } : undefined }
      );
    }

    const alreadySent = data.confirmationSentAt != null;
    if (alreadySent) {
      return NextResponse.json(
        { ok: false, error: "Confirmation already sent" },
        { status: 409 }
      );
    }

    await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(bookingRef);
      if (!tSnap.exists) throw new Error("Booking not found");
      const tData = tSnap.data()!;
      if (tData.confirmationSentAt != null) {
        throw new Error("CONFLICT"); // Will map to 409
      }
      tx.update(bookingRef, {
        confirmationSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    await onBookingCreated(resolvedSiteId, bookingId);

    return NextResponse.json({ ok: true, bookingId, siteId: resolvedSiteId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "CONFLICT") {
      return NextResponse.json({ ok: false, error: "Confirmation already sent" }, { status: 409 });
    }
    console.error("[send-booking-confirmation]", msg);
    return NextResponse.json({ ok: false, error: "Failed to send confirmation" }, { status: 500 });
  }
}
