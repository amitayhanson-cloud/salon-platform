/**
 * POST /api/sites/[siteId]/whatsapp/broadcast/count
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { listBroadcastRecipients } from "@/lib/whatsapp/broadcastRecipients";
import { MAX_BROADCAST_RECIPIENTS } from "@/lib/whatsapp/broadcastConstants";
import { parseBroadcastFiltersFromBody } from "@/lib/whatsapp/parseBroadcastBody";

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const id = siteId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "חסר מזהה אתר" }, { status: 400 });

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const forbidden = await assertSiteOwner(auth.uid, id);
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => ({}));
  const filters = parseBroadcastFiltersFromBody(body);
  if (filters instanceof NextResponse) return filters;

  try {
    const list = await listBroadcastRecipients(id, filters);
    const capped = list.length > MAX_BROADCAST_RECIPIENTS;
    return NextResponse.json({
      ok: true,
      count: list.length,
      recipients: list,
      capped,
      maxRecipients: MAX_BROADCAST_RECIPIENTS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "BROADCAST_FILTERS_EMPTY") {
      return NextResponse.json({ ok: false, error: "מסננים לא תקינים" }, { status: 400 });
    }
    console.error("[whatsapp/broadcast/count]", msg);
    return NextResponse.json({ ok: false, error: "שגיאה בחישוב נמענים" }, { status: 500 });
  }
}
