import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { getTenantForUid } from "@/lib/getTenantForUid";

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

    const requestedSiteId = request.nextUrl.searchParams.get("siteId")?.trim() ?? "";
    if (!requestedSiteId) {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }

    const siteId =
      requestedSiteId === "me"
        ? ((await getTenantForUid(uid))?.siteId ?? "")
        : requestedSiteId;
    if (!siteId) {
      return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
    }

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const { start, end } = monthRange();
    const db = getAdminDb();
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);

    async function countWithFallback(field: "siteId" | "salonId", value: string): Promise<number> {
      const queryRef = db
        .collection("whatsapp_messages")
        .where(field, "==", value)
        .where("direction", "==", "outbound")
        .where("createdAt", ">=", startTs)
        .where("createdAt", "<", endTs);
      try {
        const countSnap = await queryRef.count().get();
        return countSnap.data().count;
      } catch {
        const snap = await queryRef.get();
        return snap.size;
      }
    }

    // Primary: modern logs keyed by siteId. Legacy fallback: salonId.
    const [countBySiteId, countBySalonIdLegacy] = await Promise.all([
      countWithFallback("siteId", siteId),
      countWithFallback("salonId", siteId),
    ]);
    const outboundCount = countBySiteId + countBySalonIdLegacy;

    return NextResponse.json({
      ok: true,
      siteId,
      month: start.toISOString().slice(0, 7),
      outboundCount,
    });
  } catch (e) {
    console.error("[admin/whatsapp/monthly-count]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
