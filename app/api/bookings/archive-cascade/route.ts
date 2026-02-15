/**
 * POST /api/bookings/archive-cascade
 * Archive (soft-delete) a booking and ALL related bookings in the same multi-part set.
 * Uses resolveRelatedBookingIdsToCascadeCancel (explicit group or heuristic) then cancelBookingsCascade.
 * Same permission as other booking APIs: site owner only.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import {
  resolveRelatedBookingIdsToCascadeCancel,
  cancelBookingsCascade,
} from "@/lib/booking-cascade";

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
    const cancellationReason =
      typeof body?.cancellationReason === "string" ? body.cancellationReason.trim() || null : null;

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

    const ids = await resolveRelatedBookingIdsToCascadeCancel(siteId, bookingId);
    const groupSize = ids.length;
    const adminOptions = {
      cancellationReason: cancellationReason ?? undefined,
      cancelledBy: uid,
    };
    const { successCount, failCount } = await cancelBookingsCascade(
      siteId,
      ids,
      "manual",
      adminOptions
    );

    console.log("[ADMIN_CANCEL]", { bookingId, groupSize, reason: cancellationReason ?? "(none)" });
    console.log("[archive-cascade]", { siteId, bookingId, resolvedCount: ids.length, successCount, failCount });
    return NextResponse.json({ archived: successCount, failed: failCount, ids });
  } catch (e) {
    console.error("[archive-cascade]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
