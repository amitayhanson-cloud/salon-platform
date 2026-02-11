/**
 * POST /api/debug/whatsapp-find-booking?secret=CRON_SECRET
 * Body: { phoneE164: "+972..." }
 * Returns { foundCount, matches } for up to 5 bookings awaiting confirmation for that phone.
 * Uses same query as webhook (Firebase Admin). Helps verify production query/index.
 */

import { NextRequest, NextResponse } from "next/server";
import { findAwaitingConfirmationByPhone } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  const secretParam = request.nextUrl.searchParams.get("secret") ?? "";
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const authOk = !!(expectedSecret && secretParam === expectedSecret);
  if (!authOk) {
    return NextResponse.json({ error: "Forbidden. Use ?secret=CRON_SECRET" }, { status: 403 });
  }

  let body: { phoneE164?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expect { phoneE164: string }" },
      { status: 400 }
    );
  }

  const phoneE164 = typeof body?.phoneE164 === "string" ? body.phoneE164.trim() : "";
  if (!phoneE164) {
    return NextResponse.json(
      { error: "Missing phoneE164. Body: { phoneE164: \"+972...\" }" },
      { status: 400 }
    );
  }

  try {
    const { bookings, count } = await findAwaitingConfirmationByPhone(phoneE164);
    const matches = bookings.slice(0, 5).map((b) => ({
      bookingRef: `sites/${b.siteId}/bookings/${b.id}`,
      startAt: b.startAt.toISOString(),
      whatsappStatus: "awaiting_confirmation" as const,
      siteId: b.siteId,
    }));
    return NextResponse.json({ foundCount: count, matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: number }).code;
    return NextResponse.json(
      { error: "Query failed", message, code },
      { status: 500 }
    );
  }
}
