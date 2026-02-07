/**
 * POST /api/clients/delete-bulk
 * Delete multiple clients. For each client: optionally delete their bookings, then delete client.
 * Body: { siteId, clientIds: string[], mode: "client_only" | "client_and_bookings" }
 * Requires Firebase ID token. Site owner only.
 */

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

const BATCH_SIZE = 400;
const FieldPath = admin.firestore.FieldPath;

function requireSiteOwner(token: string | null, _siteId: string): Promise<{ uid: string } | NextResponse> {
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

async function deleteSubcollectionDocs(
  db: admin.firestore.Firestore,
  siteId: string,
  clientId: string,
  subName: string
): Promise<void> {
  const ref = db.collection("sites").doc(siteId).collection("clients").doc(clientId).collection(subName);
  let snapshot = await ref.get();
  while (!snapshot.empty) {
    const batch = db.batch();
    const chunk = snapshot.docs.slice(0, BATCH_SIZE);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snapshot.docs.length <= BATCH_SIZE) break;
    snapshot = await ref.get();
  }
}

async function deleteOneClient(
  db: admin.firestore.Firestore,
  siteId: string,
  clientId: string,
  mode: "client_only" | "client_and_bookings"
): Promise<{ ok: true } | { ok: false; clientId: string; message: string }> {
  const clientRef = db.collection("sites").doc(siteId).collection("clients").doc(clientId);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    return { ok: false, clientId, message: "client not found" };
  }

  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");

  if (mode === "client_and_bookings") {
    let snapshot = await bookingsRef
      .where("customerPhone", "==", clientId)
      .orderBy(FieldPath.documentId())
      .limit(BATCH_SIZE)
      .get();
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snapshot.docs.length < BATCH_SIZE) break;
      const last = snapshot.docs[snapshot.docs.length - 1];
      snapshot = await bookingsRef
        .where("customerPhone", "==", clientId)
        .orderBy(FieldPath.documentId())
        .startAfter(last)
        .limit(BATCH_SIZE)
        .get();
    }
  } else {
    const countSnap = await bookingsRef.where("customerPhone", "==", clientId).count().get();
    if (countSnap.data().count > 0) {
      return { ok: false, clientId, message: "client has bookings; use client_and_bookings" };
    }
  }

  for (const subName of ["chemicalCard", "personalPricing"]) {
    try {
      await deleteSubcollectionDocs(db, siteId, clientId, subName);
    } catch {
      // subcollection may not exist
    }
  }

  await clientRef.delete();
  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    const clientIds = body?.clientIds;
    const mode = body?.mode;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json({ ok: false, message: "missing or empty clientIds array" }, { status: 400 });
    }
    if (!clientIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ ok: false, message: "clientIds must be strings" }, { status: 400 });
    }
    if (mode !== "client_only" && mode !== "client_and_bookings") {
      return NextResponse.json({ ok: false, message: "mode must be client_only or client_and_bookings" }, { status: 400 });
    }

    const authResult = await requireSiteOwner(token, siteId);
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const db = getAdminDb();
    const results: Array<{ clientId: string; ok: boolean; message?: string }> = [];
    const total = clientIds.length;
    if (process.env.NODE_ENV === "development") {
      console.log("[clients/delete-bulk] start", { siteId, count: total, mode });
    }
    for (let i = 0; i < clientIds.length; i++) {
      const clientId = clientIds[i];
      if (process.env.NODE_ENV === "development" && i > 0 && i % 10 === 0) {
        console.log("[clients/delete-bulk] progress", { batch: Math.floor(i / 10) + 1, done: i, total });
      }
      const result = await deleteOneClient(db, siteId, clientId, mode);
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
