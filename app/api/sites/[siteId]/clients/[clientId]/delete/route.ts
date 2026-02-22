/**
 * POST /api/sites/[siteId]/clients/[clientId]/delete
 * Fully delete a client: document + all subcollections + all bookings.
 * siteId and clientId from URL (tenant-safe).
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string; clientId: string }> }
) {
  try {
    const { siteId, clientId } = await params;
    if (!siteId?.trim() || !clientId?.trim()) {
      return NextResponse.json({ ok: false, message: "siteId and clientId required" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const authResult = await requireAuth(token);
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const db = getAdminDb();
    const result = await deleteClientAndArchivedBookings(db, siteId, clientId);

    if (!result.ok) {
      const status = result.message.includes("not found") ? 404 : 400;
      return NextResponse.json({ ok: false, message: result.message }, { status });
    }

    return NextResponse.json({ ok: true, deletedBookingsCount: result.deletedBookingsCount });
  } catch (e) {
    console.error("[sites/clients/delete]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
