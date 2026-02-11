/**
 * GET /api/debug/whatsapp-webhook-health
 * Sanity check that production routing works. Returns JSON with webhook path.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    webhook: "/api/webhooks/twilio/whatsapp",
  });
}
