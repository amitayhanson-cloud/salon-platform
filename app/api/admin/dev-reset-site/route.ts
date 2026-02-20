/**
 * POST /api/admin/dev-reset-site
 * DEV-ONLY: Wipe ALL bookings and client history for a site. No filters.
 * Auth: site owner (Bearer). Allowed only when NODE_ENV=development OR body.secret === DEV_RESET_SECRET.
 * Body: { siteId: string, dryRun?: boolean, secret?: string }
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { devResetSite } from "@/lib/devResetSite";

function isDevResetAllowed(bodySecret: string | undefined): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.DEV_RESET_SECRET;
  if (!secret) return false;
  return typeof bodySecret === "string" && bodySecret === secret;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const siteId = (body?.siteId as string)?.trim();
    const dryRun = body?.dryRun === true;
    const secret = body?.secret as string | undefined;

    if (!siteId) {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    if (!isDevResetAllowed(secret)) {
      return NextResponse.json(
        { error: "forbidden: dev reset only allowed in NODE_ENV=development or with valid DEV_RESET_SECRET" },
        { status: 403 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const result = await devResetSite(db, siteId, { dryRun });

    return NextResponse.json({
      deletedBookings: result.deletedBookings,
      deletedClientsScanned: result.deletedClientsScanned,
      deletedArchivedServiceTypeDocs: result.deletedArchivedServiceTypeDocs,
      deletedOtherHistoryDocs: result.deletedOtherHistoryDocs,
      iterations: result.iterations,
      dryRun: result.dryRun,
    });
  } catch (e) {
    console.error("[dev-reset-site]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
