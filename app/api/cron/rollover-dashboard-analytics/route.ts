import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyCronBearerSecret } from "@/lib/server/verifyCronBearer";
import { rolloverDashboardAnalyticsForSite } from "@/lib/dashboardAnalyticsAdmin";

export const maxDuration = 300;

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function runRollover(): Promise<NextResponse> {
  const db = getAdminDb();
  const now = new Date();
  const sitesSnap = await db.collection("sites").get();
  let processed = 0;

  for (const site of sitesSnap.docs) {
    await rolloverDashboardAnalyticsForSite(db, site.id, now);
    processed += 1;
  }

  return NextResponse.json({
    ok: true,
    processed,
    at: now.toISOString(),
  });
}

export async function GET(request: NextRequest) {
  if (!verifyCronBearerSecret(request)) return unauthorized();
  try {
    return await runRollover();
  } catch (e) {
    console.error("[cron/rollover-dashboard-analytics]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!verifyCronBearerSecret(request)) return unauthorized();
  try {
    return await runRollover();
  } catch (e) {
    console.error("[cron/rollover-dashboard-analytics]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
