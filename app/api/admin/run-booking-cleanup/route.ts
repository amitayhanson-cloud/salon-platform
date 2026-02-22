/**
 * POST /api/admin/run-booking-cleanup
 * Dev/admin only: run past bookings cleanup for a site.
 * Same logic as the daily scheduled job.
 * Body: { siteId: string, beforeDate?: string (YYYY-MM-DD), dryRun?: boolean }
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { runBookingCleanupForSite } from "@/lib/cleanup/runBookingCleanupForSite";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";
import { isPlatformAdmin } from "@/lib/platformAdmin";

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
    const beforeDate =
      typeof body?.beforeDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.beforeDate)
        ? body.beforeDate
        : undefined;
    const dryRun = body?.dryRun === true;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    const email = (decoded.email as string | undefined) ?? "";
    const allowed = ownerUid === uid || isPlatformAdmin(email);
    if (!allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const siteData = siteDoc.data() as {
      config?: { archiveRetention?: { timezone?: string }; timezone?: string };
    };
    const siteTz =
      siteData?.config?.archiveRetention?.timezone ??
      siteData?.config?.timezone ??
      "Asia/Jerusalem";

    const cutoffStartOfToday =
      beforeDate ?? getDateYMDInTimezone(new Date(), siteTz);

    const result = await runBookingCleanupForSite(db, siteId, {
      cutoffStartOfToday,
      dryRun,
    });

    return NextResponse.json({
      ...result,
      dryRun,
      beforeDate: cutoffStartOfToday,
    });
  } catch (e) {
    console.error("[run-booking-cleanup]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
