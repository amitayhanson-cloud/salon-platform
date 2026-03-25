/**
 * POST /api/bookings/customer-cancel-by-phone
 * Body: { siteId: string, phone: string, bookingId: string }
 * Cancels/archives a booking visit when the phone matches the booking's customer (no Firebase login).
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  bookingDocMatchesPhoneVariants,
  phoneVariants,
} from "@/lib/bookingCustomerPhone";
import { cancelBookingsCascade } from "@/lib/booking-cascade";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";
import { MAX_RELATED_BOOKINGS } from "@/lib/whatsapp/relatedBookings";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      siteId?: string;
      phone?: string;
      bookingId?: string;
    };
    const siteId = body?.siteId;
    const phone = body?.phone;
    const bookingId = body?.bookingId;
    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ ok: false, error: "missing siteId" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ ok: false, error: "missing phone" }, { status: 400 });
    }
    if (!bookingId || typeof bookingId !== "string") {
      return NextResponse.json({ ok: false, error: "missing bookingId" }, { status: 400 });
    }

    const variants = phoneVariants(phone);
    if (variants.length === 0) {
      return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ ok: false, error: "site_not_found" }, { status: 404 });
    }

    const ref = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "booking_not_found" }, { status: 404 });
    }
    const rootData = snap.data() as Record<string, unknown>;
    if (!bookingDocMatchesPhoneVariants(rootData, variants)) {
      return NextResponse.json({ ok: false, error: "phone_mismatch" }, { status: 403 });
    }

    const { bookingIds: ids, rootId } = await getRelatedBookingIds(siteId, bookingId);
    const rootSnap = await db.collection("sites").doc(siteId).collection("bookings").doc(rootId).get();
    if (rootSnap.exists) {
      const rd = rootSnap.data() as Record<string, unknown>;
      if (!bookingDocMatchesPhoneVariants(rd, variants)) {
        return NextResponse.json({ ok: false, error: "phone_mismatch" }, { status: 403 });
      }
    }

    if (ids.length > MAX_RELATED_BOOKINGS) {
      return NextResponse.json({ ok: false, error: "too_many_related" }, { status: 400 });
    }

    const { successCount, failCount } = await cancelBookingsCascade(
      siteId,
      ids,
      "customer_cancelled_via_public_booking"
    );

    if (successCount === 0) {
      return NextResponse.json(
        { ok: false, error: "cancel_failed", failed: failCount },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, archived: successCount, failed: failCount });
  } catch (e) {
    console.error("[customer-cancel-by-phone]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
