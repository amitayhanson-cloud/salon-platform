/**
 * GET/POST /api/cron/reset-whatsapp-usage
 * Resets per-site WhatsApp usage counters monthly. Vercel Cron invokes with GET + Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyCronBearerSecret } from "@/lib/server/verifyCronBearer";

export const maxDuration = 300;

async function runReset(): Promise<NextResponse> {
  const db = getAdminDb();
  const now = Timestamp.now();
  let batch = db.batch();
  let ops = 0;
  let sites = 0;

  const snap = await db.collection("sites").get();

  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      whatsappUtilitySent: 0,
      whatsappServiceSent: 0,
      whatsappLastUsageResetAt: now,
      updatedAt: now,
    });
    ops++;
    sites++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  console.log("[cron/reset-whatsapp-usage] done", { sites, at: now.toDate().toISOString() });

  return NextResponse.json({
    ok: true,
    sitesReset: sites,
    resetAt: now.toDate().toISOString(),
  });
}

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!verifyCronBearerSecret(request)) {
    return unauthorized();
  }
  try {
    return await runReset();
  } catch (e) {
    console.error("[cron/reset-whatsapp-usage]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!verifyCronBearerSecret(request)) {
    return unauthorized();
  }
  try {
    return await runReset();
  } catch (e) {
    console.error("[cron/reset-whatsapp-usage]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
