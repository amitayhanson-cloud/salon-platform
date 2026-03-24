import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { getTenantForUid } from "@/lib/getTenantForUid";
import { getWhatsAppUsageSnapshot } from "@/lib/whatsapp/usage";

function currentMonthLabel(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${m < 10 ? "0" : ""}${m}`;
}

/**
 * GET /api/admin/whatsapp/monthly-count?siteId=...
 * Returns outbound WhatsApp usage counted toward the site’s monthly limit.
 *
 * Uses the same counters as `/api/sites/.../whatsapp/usage` (sites/{siteId}:
 * whatsappUtilitySent + whatsappServiceSent). That includes replies sent via
 * Twilio TwiML from the inbound webhook, which are not written to
 * `whatsapp_messages` as outbound API sends are.
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

    const snapshot = await getWhatsAppUsageSnapshot(siteId);

    return NextResponse.json({
      ok: true,
      siteId,
      month: currentMonthLabel(),
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
