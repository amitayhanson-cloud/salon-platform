/**
 * POST /api/repair-site-ownership
 * One-time repair: set ownerUid (and ownerUserId) on sites/{siteId} when the
 * authenticated user's document has siteId and the site doc is missing ownership.
 * Uses Admin SDK so the write succeeds even when client rules would deny read.
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Body: { siteId }
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    console.log("[repair-site-ownership] Request", {
      hasToken: !!token,
      tokenLength: token?.length ?? 0,
    });

    if (!token) {
      return NextResponse.json({ error: "unauthenticated", message: "חסר טוקן אימות." }, { status: 401 });
    }

    const auth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
      console.log("[repair-site-ownership] Token verified", { uid });
    } catch (verifyErr) {
      console.error("[repair-site-ownership] Token verification failed", verifyErr);
      return NextResponse.json(
        { error: "invalid_token", message: "טוקן לא תקף או שפג תוקפו." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
      console.warn("[repair-site-ownership] Missing or invalid siteId", { body });
      return NextResponse.json({ error: "missing siteId", message: "חסר מזהה אתר." }, { status: 400 });
    }

    const db = getAdminDb();

    // Confirm this user's document has this siteId (prevent privilege escalation)
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      console.warn("[repair-site-ownership] User doc not found", { uid });
      return NextResponse.json({ error: "user not found", message: "משתמש לא נמצא." }, { status: 404 });
    }
    const userSiteId = (userSnap.data() as { siteId?: string } | undefined)?.siteId ?? null;
    console.log("[repair-site-ownership] User doc check", { uid, userSiteId, requestSiteId: siteId });

    if (userSiteId !== siteId) {
      console.warn("[repair-site-ownership] Forbidden: user.siteId !== siteId", { userSiteId, siteId });
      return NextResponse.json(
        { error: "forbidden", message: "זה לא האתר שלך. אין הרשאה לתקן." },
        { status: 403 }
      );
    }

    const siteRef = db.collection("sites").doc(siteId);
    const siteSnap = await siteRef.get();
    if (!siteSnap.exists) {
      console.warn("[repair-site-ownership] Site not found", { siteId });
      return NextResponse.json({ error: "site not found", message: "האתר לא נמצא." }, { status: 404 });
    }

    const data = siteSnap.data() as { ownerUid?: string; ownerUserId?: string } | undefined;
    const currentOwnerUid = data?.ownerUid ?? null;
    console.log("[repair-site-ownership] Site doc", { siteId, currentOwnerUid, targetUid: uid });

    if (currentOwnerUid === uid) {
      console.log("[repair-site-ownership] Already has ownerUid, no repair needed");
      return NextResponse.json({ success: true, repaired: false });
    }

    await siteRef.update({
      ownerUid: uid,
      ownerUserId: uid,
      updatedAt: new Date(),
    });
    console.log("[repair-site-ownership] Updated site with ownerUid", { siteId, uid });

    return NextResponse.json({ success: true, repaired: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[repair-site-ownership] Error", { message, stack, error: e });
    return NextResponse.json(
      { error: "server_error", message: message || "שגיאת שרת." },
      { status: 500 }
    );
  }
}
