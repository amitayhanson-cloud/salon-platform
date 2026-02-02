/**
 * POST /api/import/dry-run
 * Validates import data and returns summary (no writes).
 * Body: { siteId, rows: RawRow[], mapping: ColumnMapping }
 * Requires Firebase ID token. Only site owner can call.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { runDryRun } from "@/lib/import/server";
import type { RawRow, ColumnMapping } from "@/lib/import/types";

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
    const rows = body?.rows as RawRow[] | undefined;
    const mapping = body?.mapping as ColumnMapping | undefined;
    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "missing rows array" }, { status: 400 });
    }
    if (!mapping || typeof mapping !== "object") {
      return NextResponse.json({ error: "missing mapping object" }, { status: 400 });
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

    const result = await runDryRun(siteId, rows, mapping);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[import/dry-run]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
