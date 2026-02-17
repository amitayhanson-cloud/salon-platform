/**
 * POST /api/clients/update
 * Update client fields (name, email, clientTypeId, clientNotes). Phone is read-only (clientId).
 * clientTypeId defaults to "regular" when missing or invalid; we always persist a value.
 * Body: { siteId, clientId, updates: { name?, email?, clientTypeId?, clientNotes? } }
 * Requires Firebase ID token. Site owner only.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { REGULAR_CLIENT_TYPE_ID } from "@/types/bookingSettings";

function requireSiteOwner(
  token: string | null,
  siteId: string
): Promise<{ uid: string } | NextResponse> {
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

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const authResult = await requireSiteOwner(token, "");
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    const clientId = body?.clientId;
    const updates = body?.updates;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }
    if (!clientId || typeof clientId !== "string") {
      return NextResponse.json({ ok: false, message: "missing clientId" }, { status: 400 });
    }

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ ok: false, message: "missing updates object" }, { status: 400 });
    }

    const name = updates.name;
    const email = updates.email;
    const clientTypeId = updates.clientTypeId;
    const clientNotes = updates.clientNotes;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return NextResponse.json({ ok: false, message: "name is required and must be non-empty" }, { status: 400 });
    }

    const db = getAdminDb();
    const clientRef = db.collection("sites").doc(siteId).collection("clients").doc(clientId);
    const snap = await clientRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, message: "client not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (name !== undefined) data.name = name.trim();
    if (email !== undefined) data.email = email == null || String(email).trim() === "" ? null : String(email).trim();
    // Always store clientTypeId; default to regular when missing or invalid
    const typeId =
      typeof clientTypeId === "string" && clientTypeId.trim() ? clientTypeId.trim() : REGULAR_CLIENT_TYPE_ID;
    data.clientTypeId = typeId;
    if (clientNotes !== undefined) data.clientNotes = clientNotes == null || String(clientNotes).trim() === "" ? null : String(clientNotes).trim();

    await clientRef.set(data, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[clients/update]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
