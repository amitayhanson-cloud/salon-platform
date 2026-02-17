/**
 * POST /api/import/execute
 * Strict client import: creates/updates clients from template-parsed rows.
 * Body: { siteId, rows: ParsedClientRow[] } (name, phone, notes?, client_type?)
 * Requires Firebase ID token. Only site owner can call.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { runExecuteStrict } from "@/lib/import/server";
import type { ParsedClientRow } from "@/lib/import/parse";

export async function POST(request: Request) {
  const start = Date.now();
  try {
    if (process.env.NODE_ENV === "development") {
      console.log("[import/execute] start request");
    }
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
    const rows = body?.rows as ParsedClientRow[] | undefined;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "missing rows array" }, { status: 400 });
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

    const result = await runExecuteStrict(siteId, rows);
    if (process.env.NODE_ENV === "development") {
      console.log("[import/execute] done in", Date.now() - start, "ms", result);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[import/execute] exception:", err.message, err.stack);
    return NextResponse.json(
      { ok: false, error: err.message, errors: [] },
      { status: 500 }
    );
  }
}
