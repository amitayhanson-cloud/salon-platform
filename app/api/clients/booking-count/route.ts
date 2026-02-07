/**
 * GET /api/clients/booking-count?siteId=...&clientId=...
 * Returns number of bookings for the client (customerPhone === clientId).
 * Requires Firebase ID token. Site owner only.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const clientId = searchParams.get("clientId");

    if (!siteId || !clientId) {
      return NextResponse.json({ ok: false, message: "missing siteId or clientId" }, { status: 400 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });
    }

    const snapshot = await db
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("customerPhone", "==", clientId)
      .count()
      .get();

    const count = snapshot.data().count ?? 0;
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    console.error("[clients/booking-count]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
