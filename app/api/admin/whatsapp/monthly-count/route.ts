import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";

function monthRange(now = new Date()): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * GET /api/admin/whatsapp/monthly-count?siteId=...
 * Returns outbound WhatsApp count for the current month for this site.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const siteId = request.nextUrl.searchParams.get("siteId")?.trim() ?? "";
    if (!siteId) {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const { start, end } = monthRange();
    const db = getAdminDb();
    const countSnap = await db
      .collection("whatsapp_messages")
      .where("siteId", "==", siteId)
      .where("direction", "==", "outbound")
      .where("createdAt", ">=", Timestamp.fromDate(start))
      .where("createdAt", "<", Timestamp.fromDate(end))
      .count()
      .get();

    return NextResponse.json({
      ok: true,
      siteId,
      month: start.toISOString().slice(0, 7),
      outboundCount: countSnap.data().count,
    });
  } catch (e) {
    console.error("[admin/whatsapp/monthly-count]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
