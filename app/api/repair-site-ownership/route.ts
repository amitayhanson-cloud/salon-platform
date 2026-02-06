/**
 * POST /api/repair-site-ownership
 * One-time repair: set ownerUid (and ownerUserId) on sites/{siteId} when the
 * authenticated user's document has siteId and the site doc is missing ownership.
 * Uses Admin SDK so the write succeeds even when client rules would deny read.
 * Body: { siteId }
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

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();

    // Confirm this user's document has this siteId (they are the intended owner)
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }
    const userSiteId = (userSnap.data() as { siteId?: string } | undefined)?.siteId ?? null;
    if (userSiteId !== siteId) {
      return NextResponse.json(
        { error: "forbidden", message: "זה לא האתר שלך. אין הרשאה לתקן." },
        { status: 403 }
      );
    }

    const siteRef = db.collection("sites").doc(siteId);
    const siteSnap = await siteRef.get();
    if (!siteSnap.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }

    const data = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
    const currentOwnerUid = data?.ownerUid ?? null;
    if (currentOwnerUid === uid) {
      return NextResponse.json({ success: true, repaired: false });
    }

    await siteRef.update({
      ownerUid: uid,
      ownerUserId: uid,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, repaired: true });
  } catch (e) {
    console.error("[repair-site-ownership]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
