import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { getTenantForUid } from "@/lib/getTenantForUid";
import { getDateYMDInTimezone } from "@/lib/expiredCleanupUtils";
import { getWhatsAppUsageSnapshotForAdminUI } from "@/lib/whatsapp/usage";

function currentMonthLabelIsrael(): string {
  return getDateYMDInTimezone(new Date(), "Asia/Jerusalem").slice(0, 7);
}

/**
 * GET /api/admin/whatsapp/monthly-count?siteId=...
 * Primary count (`outboundCount`) matches the admin graph: `dashboardCurrent.totals.whatsappCount`
 * when month aligns (Israel). Utility/service breakdown still come from site billing fields.
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

    const snapshot = await getWhatsAppUsageSnapshotForAdminUI(siteId);

    return NextResponse.json({
      ok: true,
      siteId,
      month: currentMonthLabelIsrael(),
      outboundCount: snapshot.totalUsed,
      /** Monthly cap (same field as sites/{siteId}.whatsappUsageLimit, default 250) */
      usageLimit: snapshot.whatsappUsageLimit,
      whatsappLastUsageResetAt: snapshot.whatsappLastUsageResetAt?.toMillis() ?? null,
    });
  } catch (e) {
    console.error("[admin/whatsapp/monthly-count]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
