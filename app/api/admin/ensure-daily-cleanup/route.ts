/**
 * POST /api/admin/ensure-daily-cleanup
 *
 * Lazy daily cleanup: runs past bookings cleanup once per day when admin opens the app.
 * If already ran today (lastDailyCleanupDate === today), returns ran:false.
 * Uses a lock to prevent concurrent runs (two tabs / two admins).
 *
 * Testing:
 * 1. Create bookings in the past (2–3 days ago)
 * 2. Open admin page → ensure-daily-cleanup runs and removes/archives them
 * 3. Verify sites/{siteId}.lastDailyCleanupDate updated to today
 * 4. Open admin again same day → ran:false, already_ran_today
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { runBookingCleanupForSite } from "@/lib/cleanup/runBookingCleanupForSite";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";

const LOCK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

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
    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteRef = db.collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }

    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const siteData = siteDoc.data() as {
      config?: { archiveRetention?: { timezone?: string }; timezone?: string };
      lastDailyCleanupDate?: string;
      dailyCleanupLock?: { seconds: number; nanoseconds: number };
      dailyCleanupLockBy?: string;
    };
    const siteTz =
      siteData?.config?.archiveRetention?.timezone ??
      siteData?.config?.timezone ??
      "Asia/Jerusalem";
    const todayStr = getDateYMDInTimezone(new Date(), siteTz);

    if (siteData?.lastDailyCleanupDate === todayStr) {
      if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" || process.env.NODE_ENV === "development") {
        console.log("[ensure-daily-cleanup] skipped", { siteId, reason: "already_ran_today", todayStr });
      }
      return NextResponse.json({ ran: false, reason: "already_ran_today" });
    }

    const lockTs = siteData?.dailyCleanupLock;
    if (lockTs && typeof lockTs === "object" && "seconds" in lockTs) {
      const lockMs = (lockTs.seconds || 0) * 1000 + ((lockTs.nanoseconds || 0) / 1e6);
      if (Date.now() - lockMs < LOCK_MAX_AGE_MS) {
        if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" || process.env.NODE_ENV === "development") {
          console.log("[ensure-daily-cleanup] skipped", { siteId, reason: "locked" });
        }
        return NextResponse.json({ ran: false, reason: "locked" });
      }
    }

    const { FieldValue } = await import("firebase-admin/firestore");
    await siteRef.update({
      dailyCleanupLock: FieldValue.serverTimestamp(),
      dailyCleanupLockBy: uid,
    });

    const result = await runBookingCleanupForSite(db, siteId, {
      cutoffStartOfToday: todayStr,
      dryRun: false,
    });

    await siteRef.update({
      lastDailyCleanupDate: todayStr,
      lastDailyCleanupAt: FieldValue.serverTimestamp(),
      dailyCleanupLock: FieldValue.delete(),
      dailyCleanupLockBy: FieldValue.delete(),
    });

    if (process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true" || process.env.NODE_ENV === "development") {
      console.log("[ensure-daily-cleanup] ran", {
        siteId,
        todayStr,
        ...result,
      });
    }

    return NextResponse.json({
      ran: true,
      todayStr,
      ...result,
    });
  } catch (e) {
    console.error("[ensure-daily-cleanup]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
