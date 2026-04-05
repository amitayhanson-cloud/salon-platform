/**
 * POST /api/bookings/trigger-waitlist-match
 * Admin: offer the next waitlist customer a specific empty slot (matchAnyService).
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import type { FreedBookingSlot } from "@/lib/bookingWaitlist/matchService";
import { triggerWaitlistMatchForFreedSlot } from "@/lib/bookingWaitlist/triggerWaitlistMatch";
import { normalizeBookingTimeHHmm } from "@/lib/bookingWaitlist/bookingDocToFreedSlot";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
    const dateYmd = typeof body?.dateYmd === "string" ? body.dateYmd.trim() : "";
    const timeRaw = typeof body?.timeHHmm === "string" ? body.timeHHmm.trim() : "";
    const workerId =
      typeof body?.workerId === "string" && body.workerId.trim() && body.workerId !== "__unassigned__"
        ? body.workerId.trim()
        : null;
    const workerName =
      typeof body?.workerName === "string" && body.workerName.trim() ? body.workerName.trim() : null;

    if (!siteId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      return NextResponse.json({ error: "missing_or_invalid_date" }, { status: 400 });
    }
    const timeHHmm = normalizeBookingTimeHHmm(timeRaw);
    if (!timeHHmm) {
      return NextResponse.json({ error: "missing_or_invalid_time" }, { status: 400 });
    }
    if (!workerId) {
      return NextResponse.json({ error: "worker_required" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site_not_found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const slot: FreedBookingSlot = {
      dateYmd,
      timeHHmm,
      workerId,
      workerName,
      serviceTypeId: null,
      serviceId: null,
      serviceName: "התאמה מרשימת המתנה",
      durationMin: 60,
      primaryDurationMin: 60,
      waitMinutes: 0,
      followUpDurationMin: 0,
      followUpWorkerId: null,
      followUpWorkerName: null,
      followUpServiceName: null,
    };

    const r = await triggerWaitlistMatchForFreedSlot(siteId, slot, {
      matchAnyService: true,
      skipHorizonScan: true,
    });
    return NextResponse.json({
      ok: true,
      notified: r.notified,
      entryId: r.entryId ?? null,
      reason: r.reason ?? null,
    });
  } catch (e) {
    console.error("[trigger-waitlist-match]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
