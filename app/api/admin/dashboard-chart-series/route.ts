import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { computeDashboardChartSeriesForSite } from "@/lib/dashboardAnalyticsAdmin";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    if (!siteId) return NextResponse.json({ error: "missing siteId" }, { status: 400 });

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const db = getAdminDb();
    const now = new Date();

    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const s = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
    const allowed = s?.ownerUid === uid || s?.ownerUserId === uid;
    if (!allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Fresh numbers from Firestore reads, no dashboardCurrent write (avoids lag; persistence is cron / rollover).
    const series = await computeDashboardChartSeriesForSite(db, siteId, now);

    return NextResponse.json(
      { ok: true, ...series },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (e) {
    console.error("[dashboard-chart-series]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
