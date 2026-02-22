/**
 * POST /api/clients/delete-bulk
 * Delete multiple clients. For each: full delete (bookings + client + subcollections).
 * Body: { siteId, clientIds: string[] }
 * Requires Firebase ID token. Site owner only.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { deleteClientAndArchivedBookings } from "@/lib/clients/deleteClientAndArchivedBookings";

function requireAuth(token: string | null): Promise<{ uid: string } | NextResponse> {
  if (!token) {
    return Promise.resolve(NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 }));
  }
  return getAdminAuth()
    .verifyIdToken(token)
    .then((decoded) => ({ uid: decoded.uid }))
    .catch(() => NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 }));
}

async function assertSiteOwner(uid: string, siteId: string): Promise<NextResponse | null> {
  const db = getAdminDb();
  const siteDoc = await db.collection("sites").doc(siteId).get();
  if (!siteDoc.exists) {
    return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
  }
  const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
  if (ownerUid !== uid) {
    return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });
  }
  return null;
}

async function deleteOneClient(
  db: ReturnType<typeof getAdminDb>,
  siteId: string,
  clientId: string
): Promise<{ ok: true } | { ok: false; clientId: string; message: string }> {
  const result = await deleteClientAndArchivedBookings(db, siteId, clientId);
  if (result.ok) return { ok: true };
  return { ok: false, clientId, message: result.message };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    const clientIds = body?.clientIds;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json({ ok: false, message: "missing or empty clientIds array" }, { status: 400 });
    }
    if (!clientIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ ok: false, message: "clientIds must be strings" }, { status: 400 });
    }
    const authResult = await requireAuth(token);
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const db = getAdminDb();
    const results: Array<{ clientId: string; ok: boolean; message?: string }> = [];
    const total = clientIds.length;
    if (process.env.NODE_ENV === "development") {
      console.log("[clients/delete-bulk] start", { siteId, count: total });
    }
    for (let i = 0; i < clientIds.length; i++) {
      const clientId = clientIds[i];
      if (process.env.NODE_ENV === "development" && i > 0 && i % 10 === 0) {
        console.log("[clients/delete-bulk] progress", { batch: Math.floor(i / 10) + 1, done: i, total });
      }
      const result = await deleteOneClient(db, siteId, clientId);
      results.push(
        result.ok ? { clientId, ok: true } : { clientId, ok: false, message: result.message }
      );
    }
    const deleted = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (process.env.NODE_ENV === "development") {
      console.log("[clients/delete-bulk] done", { deleted, failed });
    }

    return NextResponse.json({
      ok: failed.length === 0,
      deleted,
      failed: failed.length,
      errors: failed,
    });
  } catch (e) {
    console.error("[clients/delete-bulk]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
