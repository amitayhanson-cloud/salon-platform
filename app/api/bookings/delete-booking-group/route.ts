/**
 * POST /api/bookings/delete-booking-group
 * Delete (archive-as-is) a single booking and its related follow-ups only.
 * Uses getRelatedBookingIds (visitGroupId / parentBookingId - NO customer heuristic).
 * Does NOT touch other bookings of the same customer.
 * Same permission as other booking APIs: site owner only.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";
import { cancelBookingsCascade } from "@/lib/booking-cascade";

const MAX_WITHOUT_GROUP = 10;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId as string | undefined;
    const bookingId = body?.bookingId as string | undefined;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }
    if (!bookingId || typeof bookingId !== "string") {
      return NextResponse.json({ error: "missing bookingId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { bookingIds: ids, groupKey } = await getRelatedBookingIds(siteId, bookingId);

    if (ids.length > MAX_WITHOUT_GROUP && !groupKey) {
      return NextResponse.json(
        { error: "too_many_bookings" },
        { status: 400 }
      );
    }

    const { successCount, failCount } = await cancelBookingsCascade(
      siteId,
      ids,
      "admin_delete"
    );

    if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log("[delete-booking-group]", {
        siteId,
        bookingId,
        groupKey,
        ids,
        deletedCount: successCount,
        failCount,
      });
    }

    return NextResponse.json({ archived: successCount, failed: failCount, ids });
  } catch (e) {
    console.error("[delete-booking-group]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
