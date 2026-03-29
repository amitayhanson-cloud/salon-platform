import { NextRequest, NextResponse } from "next/server";
import { markUnsubscribedByPhone } from "@/lib/marketing/markUnsubscribedByPhone";
import { normalizeE164 } from "@/lib/whatsapp/e164";

/**
 * POST /api/waitlist/opt-out
 * Body: { phone: string } — normalized to E.164 (IL). Applies full marketing opt-out (users, clients, waitlist).
 */
export async function POST(request: NextRequest) {
  let body: { phone?: string };
  try {
    body = (await request.json()) as { phone?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "בקשה לא תקינה" }, { status: 400 });
  }

  const raw = String(body.phone ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "נא להזין מספר טלפון" }, { status: 400 });
  }

  const e164 = normalizeE164(raw.replace(/^whatsapp:/, ""), "IL");
  if (!e164) {
    return NextResponse.json({ ok: false, error: "מספר הטלפון אינו תקין" }, { status: 400 });
  }

  try {
    await markUnsubscribedByPhone(e164);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[waitlist/opt-out]", msg);
    return NextResponse.json({ ok: false, error: "לא ניתן לעדכן את ההעדפות כעת" }, { status: 500 });
  }
}
