/**
 * POST /api/booking-waitlist/delete-entry
 * Site owner: remove one bookingWaitlistEntries row (admin UI).
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
    const entryId = typeof body?.entryId === "string" ? body.entryId.trim() : "";
    if (!siteId || !entryId) {
      return NextResponse.json({ error: "missing siteId or entryId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site_not_found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const ref = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(entryId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "entry_not_found" }, { status: 404 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[booking-waitlist/delete-entry]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
