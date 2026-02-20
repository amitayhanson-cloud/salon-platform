/**
 * POST /api/admin/dev-reset-bookings
 * Dev/admin only: delete all bookings + archived history for a site (optionally one client).
 * Chunked deletes, no unbounded reads. Auth: site owner only (Bearer token).
 * Body: { siteId: string, clientId?: string, dryRun?: boolean }
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { devResetBookings } from "@/lib/devResetBookings";

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
    const dryRun = body?.dryRun === true;

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
      console.error("[dev-reset-bookings] forbidden", { siteId, uid, ownerUid });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const result = await devResetBookings(db, siteId, {
      clientId: clientId && clientId.trim() !== "" ? clientId.trim() : undefined,
      dryRun,
    });

    return NextResponse.json({
      deletedBookings: result.deletedBookings,
      deletedArchivedServiceTypes: result.deletedArchivedServiceTypes,
      deletedLegacyArchived: 0,
      iterations: {
        bookings: result.iterationsBookings,
        archived: result.iterationsArchived,
      },
      dryRun: result.dryRun,
      deletedByPath: result.deletedByPath ?? {},
    });
  } catch (e) {
    console.error("[dev-reset-bookings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
