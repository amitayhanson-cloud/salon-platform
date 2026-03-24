/**
 * GET /api/sites/[siteId]/whatsapp/usage
 * Monthly WhatsApp usage counters + limit (for admin dashboard).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { getWhatsAppUsageSnapshot } from "@/lib/whatsapp/usage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const id = siteId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "חסר מזהה אתר" }, { status: 400 });

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const forbidden = await assertSiteOwner(auth.uid, id);
  if (forbidden) return forbidden;

  try {
    const snapshot = await getWhatsAppUsageSnapshot(id);
    return NextResponse.json(
      {
        ok: true,
        siteId: id,
        whatsappUtilitySent: snapshot.whatsappUtilitySent,
        whatsappServiceSent: snapshot.whatsappServiceSent,
        totalUsed: snapshot.totalUsed,
        whatsappUsageLimit: snapshot.whatsappUsageLimit,
        whatsappLastUsageResetAt: snapshot.whatsappLastUsageResetAt?.toMillis() ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[whatsapp/usage]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
