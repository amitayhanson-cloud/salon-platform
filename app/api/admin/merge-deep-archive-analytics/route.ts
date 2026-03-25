/**
 * POST /api/admin/merge-deep-archive-analytics
 * Bearer Firebase ID token (site owner) or cron secret.
 * One-time scan of clients/.../archivedServiceTypes → writes analytics/deepArchiveMerge
 * (deduped against sites/.../bookings). Idempotent unless body.force === true.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { verifyCronBearerSecret } from "@/lib/server/verifyCronBearer";
import { applyDeepArchiveMergeAdmin } from "@/lib/dashboardDeepArchiveMergeAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId : undefined;
    const dryRun = body?.dryRun === true;
    const force = body?.force === true;

    if (!siteId) {
      return NextResponse.json({ ok: false, error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const cronOk = verifyCronBearerSecret(request);

    if (!cronOk) {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
      }
      const auth = getAdminAuth();
      const decoded = await auth.verifyIdToken(token);
      const uid = decoded.uid;

      const siteSnap = await db.collection("sites").doc(siteId).get();
      if (!siteSnap.exists) {
        return NextResponse.json({ ok: false, error: "site not found" }, { status: 404 });
      }
      const s = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
      if (s?.ownerUid !== uid && s?.ownerUserId !== uid) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    }

    const result = await applyDeepArchiveMergeAdmin(db, siteId, { dryRun, force });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      dryRun: result.dryRun,
      stats: result.stats,
      dayKeys: result.dayKeys,
    });
  } catch (e) {
    console.error("[merge-deep-archive-analytics]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
