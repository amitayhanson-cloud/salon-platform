/**
 * POST /api/cron/reset-whatsapp-usage
 * Resets per-site WhatsApp usage counters monthly. Call from cron on the 1st (e.g. Vercel cron).
 * Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const maxDuration = 300;

function checkCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token === secret) return true;
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes("vercel-cron")) return true;
  return false;
}

export async function POST(request: NextRequest) {
  if (!checkCronAuth(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

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
