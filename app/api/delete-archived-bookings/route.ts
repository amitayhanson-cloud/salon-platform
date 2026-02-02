/**
 * POST /api/delete-archived-bookings
 * Permanently deletes all archived (cancelled + expired) bookings for a site.
 * Requires Firebase ID token in Authorization: Bearer <token>.
 * Only site owner can call. Uses same logic as Cloud Function deleteArchivedBookings.
 */

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

const BATCH_SIZE = 500;
const ARCHIVED_STATUSES = ["cancelled", "canceled", "cancelled_by_salon", "no_show", "expired"];
const FieldPath = admin.firestore.FieldPath;

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
    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      console.error("[delete-archived-bookings] forbidden", { siteId, uid, ownerUid });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
    let deletedCancelled = 0;
    let deletedExpired = 0;

    let q = bookingsRef
      .where("status", "in", ARCHIVED_STATUSES)
      .orderBy(FieldPath.documentId())
      .limit(BATCH_SIZE);
    let snapshot = await q.get();

    while (!snapshot.empty) {
      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        const status = (doc.data() as { status?: string }).status;
        if (status === "expired") deletedExpired++;
        else deletedCancelled++;
      }
      await batch.commit();
      if (snapshot.docs.length < BATCH_SIZE) break;
      const last = snapshot.docs[snapshot.docs.length - 1];
      q = bookingsRef
        .where("status", "in", ARCHIVED_STATUSES)
        .orderBy(FieldPath.documentId())
        .startAfter(last)
        .limit(BATCH_SIZE);
      snapshot = await q.get();
    }

    console.log("[delete-archived-bookings] manual", {
      siteId,
      uid,
      deletedCancelled,
      deletedExpired,
    });
    return NextResponse.json({ deletedCancelled, deletedExpired });
  } catch (e) {
    console.error("[delete-archived-bookings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
