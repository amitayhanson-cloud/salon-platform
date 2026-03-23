import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeClientStatusRules } from "@/lib/clientStatusRules";
import { firestoreClientSettingsDataNeedsBackfill } from "@/lib/clientStatusSettingsBackfill";
import { recomputeAllClientsAutomatedStatus } from "@/lib/server/recomputeAllClientsAutomatedStatus";
import { DEFAULT_CLIENT_STATUS_SETTINGS, type ClientStatusRules } from "@/types/clientStatus";

/**
 * POST /api/settings/client-status/recompute
 * Owner-only. Backfills missing/partial `settings/clients` with defaults, then recomputes every client's
 * `currentStatus` (same effect as Save, without requiring the admin to touch the form).
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { siteId?: string };
    const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
    if (!siteId) return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });

    const db = getAdminDb();
    const siteRef = db.collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();
    if (!siteDoc.exists) return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
    const ownerUid = (siteDoc.data() as { ownerUid?: string } | undefined)?.ownerUid;
    if (ownerUid !== decoded.uid) return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });

    const settingsRef = siteRef.collection("settings").doc("clients");
    const settingsSnap = await settingsRef.get();
    const raw = settingsSnap.data();

    let backfilled = false;
    if (!settingsSnap.exists || firestoreClientSettingsDataNeedsBackfill(raw)) {
      const patch: Record<string, unknown> = {
        statusRules: DEFAULT_CLIENT_STATUS_SETTINGS.statusRules,
        manualTags: DEFAULT_CLIENT_STATUS_SETTINGS.manualTags,
        updatedAt: Timestamp.now(),
      };
      await settingsRef.set(patch, { merge: true });
      backfilled = true;
    }

    const afterSnap = await settingsRef.get();
    const statusRules = normalizeClientStatusRules(
      afterSnap.data()?.statusRules as Partial<ClientStatusRules> | undefined
    );
    const updatedClients = await recomputeAllClientsAutomatedStatus(db, siteId, statusRules);

    return NextResponse.json({ ok: true, updatedClients, backfilled });
  } catch (e) {
    console.error("[settings/client-status/recompute]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
