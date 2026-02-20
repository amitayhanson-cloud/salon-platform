/**
 * POST /api/dedupe-archived-bookings
 * One-time cleanup: dedupe legacy archived bookings by serviceTypeId (one per client+serviceType).
 * Admin-only (site owner). Batched and safe.
 * Body: { siteId: string, clientId?: string }. If clientId omitted, runs for all clients with legacy archived.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import {
  dedupeClientArchivedBookings,
  dedupeAllClientsArchivedBookings,
} from "@/lib/dedupeArchivedBookings";

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
    const siteId = body?.siteId as string | undefined;
    const clientId = body?.clientId as string | undefined;

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
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (clientId != null && String(clientId).trim() !== "") {
      const { deletedCount, writtenCount } = await dedupeClientArchivedBookings(db, siteId, clientId.trim());
      return NextResponse.json({
        scope: "client",
        clientId: clientId.trim(),
        deletedCount,
        writtenCount,
      });
    }

    const result = await dedupeAllClientsArchivedBookings(db, siteId);
    return NextResponse.json({
      scope: "all",
      clientsProcessed: result.clientsProcessed,
      totalDeleted: result.totalDeleted,
      totalWritten: result.totalWritten,
    });
  } catch (e) {
    console.error("[dedupe-archived-bookings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
